#!/usr/bin/env bash
# ==============================================================================
#  Discord Voice Notes & Vencord All-in-One Setup Assistant (Debian / Linux)
#  Interactive CLI installer matching Windows native installer functionality
# ==============================================================================

set -euo pipefail

# Visual Formatting
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
if [ ! -f "${ROOT_DIR}/scripts/patch-vencord.cjs" ] && [ -f "${ROOT_DIR}/../scripts/patch-vencord.cjs" ]; then
    ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

# Determine target desktop user and user home directory
TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME=$(getent passwd "${TARGET_USER}" 2>/dev/null | cut -d: -f6 || true)
if [ -z "${TARGET_HOME}" ]; then
    TARGET_HOME="${HOME}"
fi
export TARGET_USER
export TARGET_HOME

DISTRO_NAME="Linux"
DISTRO_ID="generic"
if [ -f /etc/os-release ]; then
    DISTRO_NAME=$(grep -E '^PRETTY_NAME=' /etc/os-release | cut -d= -f2 | tr -d '"' || true)
    DISTRO_ID=$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"' || true)
    [ -z "${DISTRO_NAME}" ] && DISTRO_NAME="${DISTRO_ID:-Linux}"
fi

VENCORD_DIR="${TARGET_HOME}/.config/Vencord"
VENCORD_THEMES_DIR="${VENCORD_DIR}/themes"
VENCORD_SETTINGS_DIR="${VENCORD_DIR}/settings"

banner() {
    clear 2>/dev/null || true
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "${BOLD}${CYAN}   Discord Voice Notes & Vencord Setup Tool (Linux / Multi-Distro)${NC}"
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "${BLUE}--> Target User:${NC}   ${BOLD}${TARGET_USER}${NC} (${TARGET_HOME})"
    echo -e "${BLUE}--> System Distro:${NC} ${DISTRO_NAME} (${DISTRO_ID})"
    
    # Check Discord detection
    local discord_status="${YELLOW}Searching...${NC}"
    if command -v discord >/dev/null 2>&1; then
        discord_status="${GREEN}$(command -v discord)${NC}"
    elif [ -d "/usr/share/discord" ]; then
        discord_status="${GREEN}/usr/share/discord${NC}"
    elif [ -d "/opt/discord" ]; then
        discord_status="${GREEN}/opt/discord (Arch standard)${NC}"
    elif [ -d "${TARGET_HOME}/.config/discord" ]; then
        discord_status="${GREEN}${TARGET_HOME}/.config/discord${NC}"
    else
        discord_status="${RED}Not found in standard paths${NC}"
    fi
    echo -e "${BLUE}--> Discord App:${NC}   ${discord_status}"

    # Check Audio Daemon
    local audio_status="${YELLOW}Unknown${NC}"
    if command -v pactl >/dev/null 2>&1 && pactl info >/dev/null 2>&1; then
        audio_status="${GREEN}PulseAudio / PipeWire (Active)${NC}"
    elif command -v arecord >/dev/null 2>&1; then
        audio_status="${GREEN}ALSA Utilities (Available)${NC}"
    else
        audio_status="${YELLOW}Audio utilities check advised${NC}"
    fi
    echo -e "${BLUE}--> Audio Server:${NC}  ${audio_status}"
    echo -e "${CYAN}------------------------------------------------------------------${NC}"
    echo ""
}

pause() {
    if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
        return 0
    fi
    echo ""
    read -r -p "Press [Enter] to continue..." _
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${YELLOW}Notice: This action requires administrator privileges to modify Discord system files.${NC}"
        echo -e "Elevating with sudo..."
        exec sudo -E bash "$0" "$@"
    fi
}

fix_permissions() {
    if [ -n "${TARGET_USER}" ] && [ "$(id -u)" -eq 0 ]; then
        if [ -d "${VENCORD_DIR}" ]; then
            chown -R "${TARGET_USER}:${TARGET_USER}" "${VENCORD_DIR}" 2>/dev/null || true
        fi
        if [ -d "${TARGET_HOME}/.config/discord" ]; then
            chown -R "${TARGET_USER}:${TARGET_USER}" "${TARGET_HOME}/.config/discord" 2>/dev/null || true
        fi
    fi
}

close_discord() {
    if pgrep -fi "discord" >/dev/null 2>&1; then
        echo -e "${YELLOW}--> Closing running Discord instances...${NC}"
        pkill -15 -fi "discord" 2>/dev/null || true
        sleep 1
    fi
}

install_audio_deps() {
    if [ "$(id -u)" -eq 0 ]; then
        if command -v pacman >/dev/null 2>&1; then
            if ! pacman -Q alsa-utils >/dev/null 2>&1; then
                echo -e "${BLUE}--> Installing audio utilities via pacman (alsa-utils)...${NC}"
                pacman -S --noconfirm --needed alsa-utils >/dev/null 2>&1 || true
            fi
        elif command -v apt-get >/dev/null 2>&1; then
            if ! dpkg -s libasound2 >/dev/null 2>&1; then
                echo -e "${BLUE}--> Installing audio library via apt (libasound2)...${NC}"
                apt-get update -qq && apt-get install -y -qq libasound2 >/dev/null 2>&1 || true
            fi
        fi
    fi
}

cleanup_soundboard_modules() {
    # Unload any legacy soundboard bridge PulseAudio loopback modules if present
    local target_uid
    target_uid=$(id -u "${TARGET_USER}" 2>/dev/null || echo "1000")
    local runtime_dir="/run/user/${target_uid}"
    local pactl_cmd="pactl"
    if [ -d "${runtime_dir}" ] && [ "${TARGET_USER}" != "root" ]; then
        pactl_cmd="sudo -u ${TARGET_USER} env XDG_RUNTIME_DIR=${runtime_dir} PULSE_SERVER=unix:${runtime_dir}/pulse/native pactl"
    fi
    for idx in $($pactl_cmd list short modules 2>/dev/null | grep -E "DiscordSoundboard|DiscordVoiceNotes" | awk '{print $1}'); do
        $pactl_cmd unload-module "$idx" 2>/dev/null || true
    done
}

do_install() {
    local enable_nitro="${1:-0}"
    require_root "$@"

    echo -e "\n======================================================="
    if [ "${enable_nitro}" = "1" ]; then
        echo -e " ${BOLD}${MAGENTA}Installing Voice Notes + Free Nitro (FakeNitro)${NC}"
    else
        echo -e " ${BOLD}${GREEN}Installing Voice Notes & Vencord Runtime${NC}"
    fi
    echo -e "=======================================================\n"

    close_discord
    install_audio_deps

    local patcher_script="${ROOT_DIR}/scripts/patch-vencord.cjs"
    if [ ! -f "${patcher_script}" ]; then
        patcher_script="/usr/share/discord-voice-notes/scripts/patch-vencord.cjs"
    fi

    if [ ! -f "${patcher_script}" ]; then
        echo -e "${RED}[ERROR] Patcher script not found: ${patcher_script}${NC}"
        pause
        return 1
    fi

    if [ "${enable_nitro}" = "1" ]; then
        ENABLE_FAKE_NITRO=1 node "${patcher_script}" install --enable-nitro
    else
        ENABLE_FAKE_NITRO=0 node "${patcher_script}" install
    fi

    fix_permissions

    echo -e "\n${GREEN}=======================================================${NC}"
    echo -e "${BOLD}${GREEN} Installation Complete!${NC}"
    echo -e "${GREEN}=======================================================${NC}"
    echo ""
    echo "Next steps:"
    echo " 1. Launch Discord."
    echo " 2. In any text channel or DM, right-click the '+' attachment button and click 'Send Voice Message'."
    if [ "${enable_nitro}" = "1" ]; then
        echo " 3. FakeNitro & Profile Themes are active!"
        echo "    * Custom emojis, stickers, and 1080p 60FPS streaming are unlocked."
    fi

    pause
}

do_install_themes() {
    echo -e "\n======================================================="
    echo -e " ${BOLD}${CYAN}Installing Modernized Vencord Custom Themes${NC}"
    echo -e "=======================================================\n"

    mkdir -p "${VENCORD_THEMES_DIR}"

    local themes_source="${ROOT_DIR}/themes"
    if [ ! -d "${themes_source}" ]; then
        themes_source="/usr/share/discord-voice-notes/themes"
    fi

    local installed_count=0

    if [ -d "${themes_source}" ]; then
        echo -e "${BLUE}--> Deploying themes to Vencord:${NC} ${VENCORD_THEMES_DIR}"
        cp -f "${themes_source}"/*.theme.css "${VENCORD_THEMES_DIR}/" 2>/dev/null || true
        
        # Also copy bundled assets if present
        if [ -d "${themes_source}/assets" ]; then
            mkdir -p "${VENCORD_THEMES_DIR}/assets"
            cp -rf "${themes_source}/assets/"* "${VENCORD_THEMES_DIR}/assets/" 2>/dev/null || true
        fi
        
        for tf in "${VENCORD_THEMES_DIR}"/*.theme.css; do
            if [ -f "$tf" ]; then
                local bname
                bname=$(basename "$tf")
                echo -e "${GREEN}    [OK] Installed ${bname}${NC}"
                installed_count=$((installed_count + 1))
            fi
        done
    else
        echo -e "${YELLOW}--> Themes folder not found locally. Downloading latest themes from GitHub repository...${NC}"
        local theme_files=(
            "BlackHairedBeauty.theme.css"
            "AnimeProgrammerGirl.theme.css"
            "FubukiOnePunchMan.theme.css"
            "BrunetteCrescentMoon.theme.css"
            "StylishTrendyWoman.theme.css"
            "BlondeColorfulSunset.theme.css"
            "FantasyButterflyLand.theme.css"
            "QueenLongHairFantasy.theme.css"
            "GGOKirito.theme.css"
            "NewKemonoFriends.theme.css"
            "OldAkameGaKill.theme.css"
            "NewAkameGaKill.theme.css"
        )
        for tf in "${theme_files[@]}"; do
            if curl -sSL -o "${VENCORD_THEMES_DIR}/${tf}" "https://raw.githubusercontent.com/ben-slates/discord-voice-notes/main/themes/${tf}"; then
                echo -e "${GREEN}    [OK] Downloaded and installed ${tf}${NC}"
                installed_count=$((installed_count + 1))
            fi
        done
    fi

    fix_permissions

    echo -e "\n${GREEN}=======================================================${NC}"
    echo -e "${BOLD}${GREEN} Successfully installed ${installed_count} custom themes!${NC}"
    echo -e "${GREEN} Destination: ${VENCORD_THEMES_DIR}${NC}"
    echo -e "${GREEN}=======================================================${NC}"
    echo ""
    echo "To activate:"
    echo " 1. Open Discord."
    echo " 2. Go to User Settings > Vencord > Themes."
    echo " 3. Toggle on your chosen theme and press Ctrl+R to reload."
    pause
}

do_doctor() {
    echo -e "\n======================================================="
    echo -e " ${BOLD}${BLUE}Running System Diagnostics (Doctor)${NC}"
    echo -e "=======================================================\n"

    local doc_script="${ROOT_DIR}/scripts/doctor.sh"
    if [ ! -f "${doc_script}" ]; then
        doc_script="/usr/share/discord-voice-notes/scripts/doctor.sh"
    fi

    if [ -f "${doc_script}" ]; then
        bash "${doc_script}"
    else
        echo -e "${RED}[ERROR] Diagnostics script doctor.sh not found.${NC}"
    fi

    pause
}

do_restore() {
    require_root "$@"

    echo -e "\n======================================================="
    echo -e " ${BOLD}${YELLOW}Restoring Vanilla Discord (Reverting Patches)${NC}"
    echo -e "=======================================================\n"

    close_discord
    cleanup_soundboard_modules

    local restore_script="${ROOT_DIR}/scripts/restore-discord.sh"
    if [ ! -f "${restore_script}" ]; then
        restore_script="/usr/share/discord-voice-notes/scripts/restore-discord.sh"
    fi

    if [ -f "${restore_script}" ]; then
        bash "${restore_script}"
    else
        local patcher_script="${ROOT_DIR}/scripts/patch-vencord.cjs"
        if [ -f "${patcher_script}" ]; then
            node "${patcher_script}" restore
        else
            echo -e "${RED}[ERROR] Restore script not found.${NC}"
        fi
    fi

    fix_permissions
    pause
}

do_clean_wipe() {
    require_root "$@"

    echo -e "\n======================================================="
    echo -e " ${BOLD}${RED}Complete Removal & Clean Wipe (Revert to Stock Vanilla)${NC}"
    echo -e "=======================================================\n"

    close_discord
    cleanup_soundboard_modules

    echo -e "${BLUE}--> [1/4] Reverting Discord app.asar to stock vanilla...${NC}"
    local patcher_script="${ROOT_DIR}/scripts/patch-vencord.cjs"
    if [ ! -f "${patcher_script}" ]; then
        patcher_script="/usr/share/discord-voice-notes/scripts/patch-vencord.cjs"
    fi
    if [ -f "${patcher_script}" ]; then
        node "${patcher_script}" restore 2>/dev/null || true
    fi

    local restore_script="${ROOT_DIR}/scripts/restore-discord.sh"
    if [ ! -f "${restore_script}" ]; then
        restore_script="/usr/share/discord-voice-notes/scripts/restore-discord.sh"
    fi
    if [ -f "${restore_script}" ]; then
        bash "${restore_script}" 2>/dev/null || true
    fi
    echo -e "${GREEN}    [OK] Discord core files restored to vanilla.${NC}"

    echo -e "${BLUE}--> [2/4] Removing Vencord directory (${VENCORD_DIR})...${NC}"
    rm -rf "${VENCORD_DIR}"
    echo -e "${GREEN}    [OK] Removed ~/.config/Vencord.${NC}"

    echo -e "${BLUE}--> [3/4] Purging Discord cache and modular core modules...${NC}"
    rm -rf "${TARGET_HOME}/.config/discord/Cache" "${TARGET_HOME}/.config/discord/Code Cache" 2>/dev/null || true
    rm -rf "${TARGET_HOME}/.config/discord/"[0-9]*/modules/discord_desktop_core 2>/dev/null || true
    echo -e "${GREEN}    [OK] Discord caches purged.${NC}"

    echo -e "${BLUE}--> [4/4] Checking installed system packages...${NC}"
    if command -v pacman >/dev/null 2>&1 && pacman -Q discord-voice-notes >/dev/null 2>&1; then
        echo -e "${YELLOW}    Arch Linux package discord-voice-notes is currently installed.${NC}"
        if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
            pacman -Rns --noconfirm discord-voice-notes >/dev/null 2>&1 || true
            echo -e "${GREEN}    [OK] Arch package discord-voice-notes removed.${NC}"
        else
            read -r -p "    Do you also want to remove the Arch package? (y/N): " rm_pkg
            if [[ "${rm_pkg}" =~ ^[yY]$ ]]; then
                pacman -Rns --noconfirm discord-voice-notes || true
                echo -e "${GREEN}    [OK] Arch package discord-voice-notes removed.${NC}"
            fi
        fi
    elif command -v dpkg >/dev/null 2>&1 && dpkg -s discord-voice-notes >/dev/null 2>&1; then
        echo -e "${YELLOW}    Debian package discord-voice-notes is currently installed.${NC}"
        if [ "${NON_INTERACTIVE:-0}" = "1" ]; then
            apt-get purge -y discord-voice-notes >/dev/null 2>&1 || apt-get remove -y discord-voice-notes >/dev/null 2>&1 || true
            echo -e "${GREEN}    [OK] Debian package discord-voice-notes purged.${NC}"
        else
            read -r -p "    Do you also want to remove the debian package? (y/N): " rm_pkg
            if [[ "${rm_pkg}" =~ ^[yY]$ ]]; then
                apt-get purge -y discord-voice-notes || apt-get remove -y discord-voice-notes
                echo -e "${GREEN}    [OK] Debian package discord-voice-notes removed.${NC}"
            fi
        fi
    else
        echo -e "${GREEN}    [OK] System package not installed or already removed.${NC}"
    fi

    fix_permissions

    echo -e "\n${GREEN}=======================================================${NC}"
    echo -e "${BOLD}${GREEN} Complete Clean Wipe Finished!${NC}"
    echo -e "${GREEN} Discord is now 100% stock vanilla with zero modifications.${NC}"
    echo -e "${GREEN}=======================================================${NC}"
    pause
}

show_help() {
    cat << EOF
Discord Voice Notes & Vencord All-in-One CLI Assistant (Linux - Arch / Debian / Kali / Ubuntu)

USAGE:
    ./setup.sh [OPTIONS]
    sudo discord-voice-notes [OPTIONS]

DESCRIPTION:
    Automated setup, configuration, theme manager, diagnostic assistant,
    and uninstallation utility for Discord Voice Notes and Vencord on Linux.

OPTIONS:
    -1, -i, --install, --standard
            Install Voice Notes & offline Vencord runtime (Standard mode).
            Patches official Discord app.asar and modular desktop core.

    -2, -n, --nitro, --fake-nitro
            Install Voice Notes + auto-enable Free Nitro (FakeNitro & Profile Themes).
            Unlocks custom emojis, custom stickers, and 1080p 60FPS streaming.

    -3, -t, --themes
            Install all 12 bundled custom themes (including Black Haired Beauty, Anime Programmer Girl,
            Fubuki, Crescent Moon, Trendy Woman, Sunset, Butterfly Land, Queen Fantasy, GGO Kirito, etc.)
            with complete readable chat text styling and CSP-safe assets.

    -4, -d, --doctor, --diagnostics
            Run comprehensive system health checks (audio engine, Discord binary,
            app.asar integrity, Node.js version, and permission state).

    -5, -r, --restore, --revert
            Restore Discord to original vanilla stock state (undoes all patches).

    -6, -c, --clean, --wipe, --uninstall
            Completely wipe all modifications: restores vanilla Discord, removes
            ~/.config/Vencord, clears Discord caches, unloads audio modules, and removes system packages.

    -y, --non-interactive, --yes
            Run in non-interactive batch mode (auto-accepts prompts; ideal for scripts).

    -h, --help
            Display this comprehensive help screen and exit.

EXAMPLES:
    sudo ./setup.sh                       # Open interactive colored CLI menu
    sudo ./setup.sh --nitro               # Direct unattended install with Free Nitro
    sudo ./setup.sh --themes              # Deploy all custom themes
    sudo ./setup.sh --doctor              # Run environment diagnostics
    sudo ./setup.sh --restore             # Revert Discord back to vanilla
    sudo ./setup.sh --clean               # Complete fresh wipe and cleanup

EOF
}

# ------------------------------------------------------------------------------
# Direct Argument Handlers (CLI execution without interactive prompts)
# ------------------------------------------------------------------------------
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
ACTION=""

while [ $# -gt 0 ]; do
    case "$1" in
        -y|--yes|--non-interactive)
            NON_INTERACTIVE=1
            shift
            ;;
        --install|-1|-i|--standard)
            ACTION="install"
            shift
            ;;
        --nitro|-2|-n|--fake-nitro)
            ACTION="nitro"
            shift
            ;;
        --themes|-3|-t)
            ACTION="themes"
            shift
            ;;
        --doctor|-4|-d|--diagnostics)
            ACTION="doctor"
            shift
            ;;
        --restore|-5|-r|--revert)
            ACTION="restore"
            shift
            ;;
        --clean|-6|-c|--wipe|--uninstall)
            ACTION="clean"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run './setup.sh --help' for complete usage details."
            exit 1
            ;;
    esac
done

if [ -n "${ACTION}" ]; then
    case "${ACTION}" in
        install)
            do_install 0
            exit 0
            ;;
        nitro)
            do_install 1
            exit 0
            ;;
        themes)
            do_install_themes
            exit 0
            ;;
        doctor)
            do_doctor
            exit 0
            ;;
        restore)
            do_restore
            exit 0
            ;;
        clean)
            do_clean_wipe
            exit 0
            ;;
    esac
fi

# ------------------------------------------------------------------------------
# Interactive Menu Loop (Default when launched without arguments)
# ------------------------------------------------------------------------------
while true; do
    banner
    echo -e "${BOLD}Select an option:${NC}"
    echo -e "  ${GREEN}[1]${NC} Install Discord Voice Notes & Vencord (Standard)"
    echo -e "  ${MAGENTA}[2]${NC} Install Voice Notes + Enable Free Nitro (FakeNitro & Profile Themes)"
    echo -e "  ${CYAN}[3]${NC} Install Custom Themes (12 High-Contrast Themes with Custom Chat Text)"
    echo -e "  ${BLUE}[4]${NC} Run System Diagnostics (Doctor)"
    echo -e "  ${YELLOW}[5]${NC} Restore Vanilla Discord (Unpatch / Revert)"
    echo -e "  ${RED}[6]${NC} Complete Clean Wipe (Remove All & Revert to Stock Vanilla)"
    echo -e "  ${NC}[7]${NC} Exit"
    echo ""
    read -r -p "Enter your choice (1-7): " choice

    case "${choice}" in
        1)
            do_install 0
            ;;
        2)
            do_install 1
            ;;
        3)
            do_install_themes
            ;;
        4)
            do_doctor
            ;;
        5)
            do_restore
            ;;
        6)
            do_clean_wipe
            ;;
        7|q|Q)
            echo -e "\nExiting. Have a great day!"
            exit 0
            ;;
        *)
            echo -e "\n${RED}Invalid choice. Please select 1 through 7.${NC}"
            sleep 1
            ;;
    esac
done
