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

VENCORD_DIR="${TARGET_HOME}/.config/Vencord"
VENCORD_THEMES_DIR="${VENCORD_DIR}/themes"
VENCORD_SETTINGS_DIR="${VENCORD_DIR}/settings"

banner() {
    clear 2>/dev/null || true
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "${BOLD}${CYAN}   Discord Voice Notes & Vencord Setup Tool (Debian / Linux)      ${NC}"
    echo -e "${CYAN}==================================================================${NC}"
    echo -e "${BLUE}--> Target User:${NC}   ${BOLD}${TARGET_USER}${NC} (${TARGET_HOME})"
    
    # Check Discord detection
    local discord_status="${YELLOW}Searching...${NC}"
    if command -v discord >/dev/null 2>&1; then
        discord_status="${GREEN}$(command -v discord)${NC}"
    elif [ -d "/usr/share/discord" ]; then
        discord_status="${GREEN}/usr/share/discord${NC}"
    elif [ -d "/opt/discord" ]; then
        discord_status="${GREEN}/opt/discord${NC}"
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
    if [ "$(id -u)" -eq 0 ] && command -v apt-get >/dev/null 2>&1; then
        local need_install=0
        for pkg in sox libsox-fmt-all; do
            if ! dpkg -s "$pkg" >/dev/null 2>&1; then
                need_install=1
                break
            fi
        done
        if [ $need_install -eq 1 ]; then
            echo -e "${BLUE}--> Installing recommended audio packages (sox, libsox-fmt-all)...${NC}"
            apt-get update -qq && apt-get install -y -qq sox libsox-fmt-all libasound2 >/dev/null 2>&1 || true
        fi
    fi
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
        echo " 3. FakeNitro is active! You can now use custom emojis, stickers, and 1080p 60FPS streaming."
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

    if [ -d "${themes_source}" ]; then
        echo -e "${BLUE}--> Deploying themes to:${NC} ${VENCORD_THEMES_DIR}"
        cp -f "${themes_source}"/*.theme.css "${VENCORD_THEMES_DIR}/" 2>/dev/null || true
        
        # Also copy bundled assets if present
        if [ -d "${themes_source}/assets" ]; then
            mkdir -p "${VENCORD_THEMES_DIR}/assets"
            cp -rf "${themes_source}/assets/"* "${VENCORD_THEMES_DIR}/assets/" 2>/dev/null || true
        fi
        
        echo -e "${GREEN}    [OK] Installed New Kemono Friends Theme (${VENCORD_THEMES_DIR}/NewKemonoFriends.theme.css)${NC}"
        echo -e "${GREEN}    [OK] Installed GGO Kirito Theme (${VENCORD_THEMES_DIR}/GGOKirito.theme.css)${NC}"
    else
        echo -e "${YELLOW}--> Themes folder not found locally. Downloading latest themes from GitHub repository...${NC}"
        curl -sSL -o "${VENCORD_THEMES_DIR}/NewKemonoFriends.theme.css" \
            "https://raw.githubusercontent.com/ben-slates/discord-voice-notes/main/themes/NewKemonoFriends.theme.css" || true
        curl -sSL -o "${VENCORD_THEMES_DIR}/GGOKirito.theme.css" \
            "https://raw.githubusercontent.com/ben-slates/discord-voice-notes/main/themes/GGOKirito.theme.css" || true
        echo -e "${GREEN}    [OK] Downloaded and installed latest themes.${NC}"
    fi

    fix_permissions

    echo -e "\n${GREEN}Themes installed successfully!${NC}"
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

# ------------------------------------------------------------------------------
# Direct Argument Handlers (CLI execution without interactive prompts)
# ------------------------------------------------------------------------------
if [ $# -gt 0 ]; then
    case "$1" in
        --install|-1|--standard)
            do_install 0
            exit 0
            ;;
        --nitro|-2|--fake-nitro)
            do_install 1
            exit 0
            ;;
        --themes|-3)
            do_install_themes
            exit 0
            ;;
        --doctor|-4|-d)
            do_doctor
            exit 0
            ;;
        --restore|-5|-r)
            do_restore
            exit 0
            ;;
        --help|-h)
            echo "Discord Voice Notes All-in-One Setup Tool"
            echo "Usage: ./setup.sh [OPTION]"
            echo ""
            echo "Options:"
            echo "  --install, -1        Install Voice Notes & Vencord (Standard)"
            echo "  --nitro, -2          Install Voice Notes + Enable Free Nitro (FakeNitro)"
            echo "  --themes, -3         Install Custom Themes (New Kemono Friends & GGO Kirito)"
            echo "  --doctor, -4         Run System Diagnostics"
            echo "  --restore, -5        Restore Discord to Vanilla state"
            echo "  --help, -h           Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run './setup.sh --help' for usage."
            exit 1
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
    echo -e "  ${MAGENTA}[2]${NC} Install Voice Notes + Enable Free Nitro (FakeNitro)"
    echo -e "  ${CYAN}[3]${NC} Install Custom Themes (New Kemono Friends & GGO Kirito)"
    echo -e "  ${BLUE}[4]${NC} Run System Diagnostics (Doctor)"
    echo -e "  ${YELLOW}[5]${NC} Restore Vanilla Discord (Unpatch / Revert)"
    echo -e "  ${RED}[6]${NC} Exit"
    echo ""
    read -r -p "Enter your choice (1-6): " choice

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
        6|q|Q)
            echo -e "\nExiting. Have a great day!"
            exit 0
            ;;
        *)
            echo -e "\n${RED}Invalid choice. Please select 1 through 6.${NC}"
            sleep 1
            ;;
    esac
done
