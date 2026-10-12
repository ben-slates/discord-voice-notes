#!/usr/bin/env bash
# Installation assistant for Discord Voice Notes on Debian/Kali Linux

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

export TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME=$(getent passwd "${TARGET_USER}" 2>/dev/null | cut -d: -f6 || true)
if [ -z "${TARGET_HOME}" ]; then
    TARGET_HOME="${HOME}"
fi
export TARGET_HOME

show_help() {
    echo "Discord Voice Notes Installer & Setup Tool"
    echo ""
    echo "Usage: discord-voice-notes [OPTION]"
    echo ""
    echo "Options:"
    echo "  --help, -h          Show this help message"
    echo "  --doctor, -d        Run diagnostic check on environment and Discord"
    echo "  --userplugin, -u    Install pre-built plugin into ~/.config/Vencord/userplugins/DiscordVoiceNotes"
    echo "  --setup-vencord     Download & install Vencord client mod if not already present"
    echo "  --vencord-src DIR   Copy plugin into a local Vencord source tree (src/userplugins/)"
    echo "  --restore, -r       Restore Discord to original vanilla state (undo modifications)"
    echo ""
}

MODE="${1:-}"

if [ -z "${MODE}" ] || [ "${MODE}" = "--help" ] || [ "${MODE}" = "-h" ]; then
    show_help
    exit 0
fi

if [ "${MODE}" = "--doctor" ] || [ "${MODE}" = "-d" ]; then
    "${SCRIPT_DIR}/doctor.sh"
    exit 0
fi

if [ "${MODE}" = "--restore" ] || [ "${MODE}" = "-r" ]; then
    "${SCRIPT_DIR}/restore-discord.sh"
    exit 0
fi

if [ "${MODE}" = "--userplugin" ] || [ "${MODE}" = "-u" ]; then
    DEST_DIR="${TARGET_HOME}/.config/Vencord/userplugins/DiscordVoiceNotes"
    echo -e "${BLUE}--> Target user:${NC} ${TARGET_USER} (${TARGET_HOME})"
    echo -e "${BLUE}--> Installing DiscordVoiceNotes to:${NC} ${DEST_DIR}"

    mkdir -p "${DEST_DIR}"

    PLUGIN_SOURCE=""
    if [ -d "${ROOT_DIR}/plugin" ] && [ -f "${ROOT_DIR}/plugin/index.js" ]; then
        PLUGIN_SOURCE="${ROOT_DIR}/plugin"
    elif [ -d "${ROOT_DIR}/dist/plugin" ] && [ -f "${ROOT_DIR}/dist/plugin/index.js" ]; then
        PLUGIN_SOURCE="${ROOT_DIR}/dist/plugin"
    elif [ -f "${ROOT_DIR}/scripts/build.sh" ] && [ -d "${ROOT_DIR}/node_modules" ]; then
        echo "--> Building plugin from source..."
        "${ROOT_DIR}/scripts/build.sh"
        PLUGIN_SOURCE="${ROOT_DIR}/dist/plugin"
    fi

    if [ -n "${PLUGIN_SOURCE}" ] && [ -d "${PLUGIN_SOURCE}" ]; then
        echo "--> Copying pre-compiled plugin bundles..."
        cp -rf "${PLUGIN_SOURCE}/"* "${DEST_DIR}/"
    else
        echo -e "${YELLOW}Warning: Pre-compiled plugin directory not found. Copying source files directly.${NC}"
    fi

    if [ -d "${ROOT_DIR}/src" ]; then
        cp -rf "${ROOT_DIR}/src" "${DEST_DIR}/"
    fi
    if [ -f "${ROOT_DIR}/source-manifest.json" ]; then
        cp -f "${ROOT_DIR}/source-manifest.json" "${DEST_DIR}/"
    elif [ -f "${ROOT_DIR}/dist/source-manifest.json" ]; then
        cp -f "${ROOT_DIR}/dist/source-manifest.json" "${DEST_DIR}/"
    fi

    cat << 'EOF' > "${DEST_DIR}/package.json"
{
  "name": "DiscordVoiceNotes",
  "version": "1.0.0",
  "description": "Discord Voice Notes add-on for Linux",
  "main": "index.js",
  "types": "src/plugin/index.d.ts"
}
EOF

    if [ -n "${SUDO_USER:-}" ] && [ "$(id -u)" -eq 0 ]; then
        chown -R "${TARGET_USER}:${TARGET_USER}" "${DEST_DIR}"
    fi

    echo -e "${GREEN}    [OK] DiscordVoiceNotes installed successfully into:${NC}"
    echo "         ${DEST_DIR}"
    echo ""
    echo "Next steps:"
    echo " 1. Make sure Vencord is installed in Discord (run 'discord-voice-notes --doctor' to check)."
    echo " 2. In Discord, go to User Settings > Vencord > Plugins."
    echo " 3. Enable 'DiscordVoiceNotes' and reload Discord (Ctrl+R)."
    exit 0
fi

if [ "${MODE}" = "--setup-vencord" ]; then
    PATCHER_SCRIPT="${SCRIPT_DIR}/patch-vencord.cjs"
    if [ ! -f "${PATCHER_SCRIPT}" ]; then PATCHER_SCRIPT="${ROOT_DIR}/scripts/patch-vencord.cjs"; fi
    if [ -f "${PATCHER_SCRIPT}" ]; then
        node "${PATCHER_SCRIPT}" install
        exit 0
    else
        echo -e "${RED}Error: patch-vencord.cjs not found.${NC}"
        exit 1
    fi
fi

if [ "${MODE}" = "--setup-vencord-nitro" ]; then
    PATCHER_SCRIPT="${SCRIPT_DIR}/patch-vencord.cjs"
    if [ ! -f "${PATCHER_SCRIPT}" ]; then PATCHER_SCRIPT="${ROOT_DIR}/scripts/patch-vencord.cjs"; fi
    if [ -f "${PATCHER_SCRIPT}" ]; then
        ENABLE_FAKE_NITRO=1 node "${PATCHER_SCRIPT}" install --enable-nitro
        exit 0
    else
        echo -e "${RED}Error: patch-vencord.cjs not found.${NC}"
        exit 1
    fi
fi

if [ "${MODE}" = "--vencord-src" ]; then
    TARGET_REPO="${2:-}"
    if [ -z "${TARGET_REPO}" ] || [ ! -d "${TARGET_REPO}" ]; then
        echo -e "${RED}Error: Please specify a valid Vencord repository directory.${NC}"
        echo "Example: discord-voice-notes --vencord-src /path/to/Vencord"
        exit 1
    fi

    DEST="${TARGET_REPO}/src/userplugins/DiscordVoiceNotes"
    echo -e "${BLUE}--> Copying plugin to Vencord userplugins:${NC} ${DEST}"
    mkdir -p "${DEST}"

    if [ -d "${ROOT_DIR}/src" ]; then
        cp -rf "${ROOT_DIR}/src/audio" "${DEST}/"
        cp -rf "${ROOT_DIR}/src/discord" "${DEST}/"
        cp -rf "${ROOT_DIR}/src/components" "${DEST}/"
        cp -f "${ROOT_DIR}/src/plugin/VoiceBarButton.tsx" "${DEST}/"
        cp -f "${ROOT_DIR}/src/plugin/index.ts" "${DEST}/"
        if [ -f "${ROOT_DIR}/src/declarations.d.ts" ]; then
            cp -f "${ROOT_DIR}/src/declarations.d.ts" "${DEST}/"
        fi
    fi

    echo -e "${GREEN}    [OK] Plugin copied into ${DEST}.${NC}"
    echo "    Now run 'pnpm build' in ${TARGET_REPO} to compile Vencord with the plugin."
    exit 0
fi

echo -e "${RED}Unknown option: ${MODE}${NC}"
show_help
exit 1
