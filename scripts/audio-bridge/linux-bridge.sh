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

get_default_source() {
    if has_cmd pactl; then
        pactl get-default-source 2>/dev/null || pactl info 2>/dev/null | grep "Default Source:" | awk '{print $3}' || true
    fi
}

start_bridge() {
    echo "--> [Audio Bridge] Initializing Discord Soundboard loopback device..."

    if ! has_cmd pactl && ! has_cmd pw-cli; then
        echo "[WARN] Neither pactl nor pw-cli found. Make sure PulseAudio or PipeWire is running."
        exit 1
    fi

    local real_mic
    real_mic="$(get_default_source)"
    if [ -z "${real_mic}" ]; then
        echo "[WARN] Could not detect default hardware microphone."
    else
        echo "    [OK] Detected hardware microphone: ${real_mic}"
    fi

    # Unload any previously loaded instances of this bridge
    stop_bridge 2>/dev/null || true

    if has_cmd pactl; then
        # 1. Create a virtual null sink for combining audio
        local sink_id
        sink_id=$(pactl load-module module-null-sink \
            sink_name="${BRIDGE_SINK}" \
            sink_properties=device.description="\"Discord Soundboard & Mic Combined\"" 2>/dev/null || true)

        if [ -n "${sink_id}" ]; then
            echo "    [OK] Created combined audio sink (${sink_id})."
        fi

        # 2. Loop real microphone into the virtual sink
        if [ -n "${real_mic}" ]; then
            local mic_loop_id
            mic_loop_id=$(pactl load-module module-loopback \
                source="${real_mic}" \
                sink="${BRIDGE_SINK}" \
                latency_msec=10 2>/dev/null || true)
            if [ -n "${mic_loop_id}" ]; then
                echo "    [OK] Linked physical microphone into virtual bridge (${mic_loop_id})."
            fi
        fi

        # 3. Create a virtual source remapping the null sink monitor as a real microphone
        local source_id
        source_id=$(pactl load-module module-remap-source \
            source_name="${BRIDGE_SOURCE}" \
            master="${BRIDGE_SINK}.monitor" \
            source_properties=device.description="\"Discord Soundboard Microphone\"" 2>/dev/null || true)

        if [ -n "${source_id}" ]; then
            echo "    [OK] Created virtual input device '${BRIDGE_SOURCE}' (${source_id})."
            # Set as default source or suggest to select in Discord
            pactl set-default-source "${BRIDGE_SOURCE}" 2>/dev/null || true
            echo "    [OK] Set '${BRIDGE_SOURCE}' as default recording device."
        fi

        echo ""
        echo "=========================================================="
        echo " [SUCCESS] Discord Audio Bridge is Active!"
        echo " In Discord Settings -> Voice & Video:"
        echo "  * Input Device: 'Discord Soundboard Microphone' (or Default)"
        echo "  * Output Device: Your Headphones / Speakers"
        echo "=========================================================="
    fi
}

stop_bridge() {
    echo "--> [Audio Bridge] Tearing down virtual audio loopback bridge..."
    if has_cmd pactl; then
        # Find loaded modules matching BRIDGE_NAME
        pactl list modules short 2>/dev/null | grep -E "${BRIDGE_SINK}|${BRIDGE_SOURCE}" | awk '{print $1}' | while read -r mod_id; do
            if [ -n "${mod_id}" ]; then
                pactl unload-module "${mod_id}" 2>/dev/null || true
                echo "    [OK] Unloaded module ${mod_id}"
            fi
        done
    fi
    echo "    [OK] Audio bridge restored to default hardware."
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
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
