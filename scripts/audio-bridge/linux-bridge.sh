#!/usr/bin/env bash
# ==============================================================================
# Linux Audio Loopback Bridge for Discord Soundboard & Microphone Mixing
# Works transparently on PipeWire & PulseAudio (Arch / Debian / Ubuntu / Kali)
# ==============================================================================
set -euo pipefail

ACTION="${1:-start}"
BRIDGE_NAME="DiscordSoundboardBridge"
BRIDGE_SINK="${BRIDGE_NAME}_Sink"
BRIDGE_SOURCE="${BRIDGE_NAME}_Mic"

# Ensure user runtime dir is set if running in non-login subshell
if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    CURRENT_UID="$(id -u)"
    if [ -d "/run/user/${CURRENT_UID}" ]; then
        export XDG_RUNTIME_DIR="/run/user/${CURRENT_UID}"
    fi
fi
if [ -z "${PULSE_SERVER:-}" ] && [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -S "${XDG_RUNTIME_DIR}/pulse/native" ]; then
    export PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native"
fi

# Check available audio server
has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# Reliably find the real physical hardware microphone
get_hardware_mic() {
    local mic=""
    if has_cmd pactl; then
        # 1. Look for physical ALSA hardware inputs (e.g. alsa_input.pci-..., alsa_input.usb-...)
        mic="$(pactl list sources short 2>/dev/null | awk '{print $2}' | grep -E '^alsa_input' | grep -v 'monitor' | grep -v 'DiscordSoundboard' | head -n 1 || true)"
        if [ -n "${mic}" ]; then
            echo "${mic}"
            return
        fi

        # 2. Look for any non-monitor source that isn't our bridge
        mic="$(pactl list sources short 2>/dev/null | awk '{print $2}' | grep -v 'monitor' | grep -v 'DiscordSoundboard' | head -n 1 || true)"
        if [ -n "${mic}" ]; then
            echo "${mic}"
            return
        fi

        # 3. Fallback to default source if not a monitor or bridge
        local def_src
        def_src="$(pactl get-default-source 2>/dev/null || pactl info 2>/dev/null | grep "Default Source:" | awk '{print $3}' || true)"
        if [ -n "${def_src}" ] && [[ ! "${def_src}" =~ (DiscordSoundboard|monitor) ]]; then
            echo "${def_src}"
            return
        fi
    fi
}

stop_bridge() {
    echo "--> [Audio Bridge] Tearing down virtual audio loopback bridge..."
    if has_cmd pactl; then
        # Find loaded modules matching BRIDGE_NAME or loopback to BRIDGE_SINK
        pactl list modules short 2>/dev/null | grep -E "${BRIDGE_SINK}|${BRIDGE_SOURCE}" | awk '{print $1}' | while read -r mod_id; do
            if [ -n "${mod_id}" ]; then
                pactl unload-module "${mod_id}" 2>/dev/null || true
                echo "    [OK] Unloaded bridge module ${mod_id}"
            fi
        done
    fi
    echo "    [OK] Audio bridge modules removed."
}

start_bridge() {
    echo "--> [Audio Bridge] Initializing Discord Soundboard loopback device..."

    if ! has_cmd pactl && ! has_cmd pw-cli; then
        echo "[ERROR] Neither pactl nor pw-cli found. Please install pulseaudio-utils."
        exit 1
    fi

    # 1. Clean up any existing bridge instances first
    stop_bridge 2>/dev/null || true

    # 2. Detect the real physical hardware microphone
    local real_mic
    real_mic="$(get_hardware_mic)"
    if [ -z "${real_mic}" ]; then
        echo "[WARN] Could not find physical hardware microphone via ALSA/Pulse. Checking default..."
        real_mic="$(pactl get-default-source 2>/dev/null || true)"
    fi

    if [ -n "${real_mic}" ]; then
        echo "    [OK] Connected hardware microphone: ${real_mic}"
    else
        echo "    [WARN] No hardware microphone detected! Ensure mic is plugged in."
    fi

    if has_cmd pactl; then
        # 3. Create virtual null sink for mixing microphone + soundboard audio
        local sink_id
        sink_id=$(pactl load-module module-null-sink \
            sink_name="${BRIDGE_SINK}" \
            sink_properties=device.description="\"Discord Soundboard & Mic Combined\"" 2>/dev/null || true)

        if [ -n "${sink_id}" ]; then
            echo "    [OK] Created combined audio sink (${sink_id})."
        fi

        # 4. Loop real physical microphone into the virtual sink (latency 5ms)
        if [ -n "${real_mic}" ]; then
            local mic_loop_id
            mic_loop_id=$(pactl load-module module-loopback \
                source="${real_mic}" \
                sink="${BRIDGE_SINK}" \
                latency_msec=5 2>/dev/null || true)
            if [ -n "${mic_loop_id}" ]; then
                echo "    [OK] Routed physical mic into virtual sink (${mic_loop_id})."
            fi
        fi

        # 5. Create virtual microphone device from sink monitor
        local source_id
        source_id=$(pactl load-module module-remap-source \
            source_name="${BRIDGE_SOURCE}" \
            master="${BRIDGE_SINK}.monitor" \
            source_properties=device.description="\"Discord Soundboard Microphone\"" 2>/dev/null || true)

        if [ -n "${source_id}" ]; then
            echo "    [OK] Created virtual microphone '${BRIDGE_SOURCE}' (${source_id})."
        fi

        # 6. Ensure all virtual devices and loopbacks are unmuted with volume at 100%
        pactl set-sink-mute "${BRIDGE_SINK}" 0 2>/dev/null || true
        pactl set-sink-volume "${BRIDGE_SINK}" 65536 2>/dev/null || true
        pactl set-source-mute "${BRIDGE_SOURCE}" 0 2>/dev/null || true
        pactl set-source-volume "${BRIDGE_SOURCE}" 65536 2>/dev/null || true
        pactl set-source-mute "${BRIDGE_SINK}.monitor" 0 2>/dev/null || true
        pactl set-source-volume "${BRIDGE_SINK}.monitor" 65536 2>/dev/null || true

        echo ""
        echo "=========================================================="
        echo " [SUCCESS] Discord Audio Bridge is Active!"
        echo " In Discord Settings -> Voice & Video:"
        echo "  * Input Device: 'Discord Soundboard Microphone'"
        echo "  * Output Device: Your Headphones / Speakers"
        echo "=========================================================="
    fi
}

status_bridge() {
    if has_cmd pactl; then
        if pactl list sources short 2>/dev/null | grep -q "${BRIDGE_SOURCE}"; then
            echo "[STATUS] Bridge is ACTIVE: '${BRIDGE_SOURCE}' is available."
        else
            echo "[STATUS] Bridge is INACTIVE."
        fi
    fi
}

play_sound() {
    local target_sound="${2:-${1:-}}"
    if [ -z "${target_sound}" ] || [ "${target_sound}" = "play" ]; then
        shift 2>/dev/null || true
        target_sound="${1:-}"
    fi

    if [ -z "${target_sound}" ]; then
        echo "[ERROR] No sound URL or file provided." >&2
        return 1
    fi

    local temp_raw="/tmp/discord_sb_$$.tmp"
    local temp_wav="/tmp/discord_sb_$$.wav"

    if [[ "${target_sound}" =~ ^https?:// ]]; then
        if has_cmd curl; then
            curl -sL "${target_sound}" -o "${temp_raw}" 2>/dev/null || true
        elif has_cmd wget; then
            wget -qO "${temp_raw}" "${target_sound}" 2>/dev/null || true
        fi
    else
        cp -f "${target_sound}" "${temp_raw}" 2>/dev/null || true
    fi

    if [ -f "${temp_raw}" ]; then
        # Convert any format (MP3, Ogg, AAC, WebM) to 16-bit 48kHz WAV so paplay can always play it
        if has_cmd ffmpeg; then
            ffmpeg -y -i "${temp_raw}" -ar 48000 -ac 2 -c:a pcm_s16le "${temp_wav}" >/dev/null 2>&1 || true
        elif has_cmd sox; then
            sox "${temp_raw}" -r 48000 -c 2 "${temp_wav}" >/dev/null 2>&1 || true
        else
            mv "${temp_raw}" "${temp_wav}" 2>/dev/null || true
        fi

        rm -f "${temp_raw}" 2>/dev/null || true

        if [ -f "${temp_wav}" ]; then
            # 1. Play directly into virtual sink (transmitted into Discord call)
            if has_cmd paplay; then
                paplay --device="${BRIDGE_SINK}" "${temp_wav}" 2>/dev/null &
                # 2. Also play into headphones (so you hear it locally)
                paplay "${temp_wav}" 2>/dev/null &
            elif has_cmd pw-play; then
                pw-play --target="${BRIDGE_SINK}" "${temp_wav}" 2>/dev/null &
                pw-play "${temp_wav}" 2>/dev/null &
            elif has_cmd aplay; then
                aplay -D "${BRIDGE_SINK}" "${temp_wav}" 2>/dev/null &
                aplay "${temp_wav}" 2>/dev/null &
            fi

            (sleep 20 && rm -f "${temp_wav}" 2>/dev/null) &
        fi
    fi
}

case "${ACTION}" in
    start)
        start_bridge
        ;;
    stop)
        stop_bridge
        ;;
    restart)
        stop_bridge
        start_bridge
        ;;
    status)
        status_bridge
        ;;
    play)
        play_sound "$@"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|play <url_or_file>}"
        exit 1
        ;;
esac
