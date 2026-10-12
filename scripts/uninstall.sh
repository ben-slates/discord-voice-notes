#!/usr/bin/env bash
# Discord Voice Notes - Uninstaller Tool for Debian/Kali Linux

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME=$(getent passwd "${TARGET_USER}" 2>/dev/null | cut -d: -f6 || true)
if [ -z "${TARGET_HOME}" ]; then
    TARGET_HOME="${HOME}"
fi

echo "=========================================================="
echo "      Discord Voice Notes - Uninstallation Tool           "
echo "=========================================================="
echo -e "${BLUE}Target user:${NC} ${TARGET_USER} (${TARGET_HOME})"
echo ""

# 1. Remove userplugin
USERPLUGIN_DIR="${TARGET_HOME}/.config/Vencord/userplugins/DiscordVoiceNotes"
if [ -d "${USERPLUGIN_DIR}" ]; then
    echo "--> Removing userplugin directory: ${USERPLUGIN_DIR}"
    rm -rf "${USERPLUGIN_DIR}"
    echo -e "${GREEN}    [OK] Userplugin removed.${NC}"
else
    echo "    [INFO] Userplugin directory not found (${USERPLUGIN_DIR})."
fi

# 2. Check if user wants to restore vanilla Discord
RESTORE="${1:-}"
if [ "${RESTORE}" = "--restore" ] || [ "${RESTORE}" = "--all" ]; then
    echo ""
    echo "--> Restoring vanilla Discord client..."
    "${SCRIPT_DIR}/restore-discord.sh"
fi

# 3. Mention package uninstallation if installed via dpkg/apt
if dpkg -s discord-voice-notes >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}Notice: The 'discord-voice-notes' Debian package is currently installed.${NC}"
    echo "To completely remove the system package, run:"
    echo "    sudo apt remove discord-voice-notes"
    echo "  or:"
    echo "    sudo dpkg -r discord-voice-notes"
fi

echo ""
echo -e "${GREEN}Uninstallation routine completed.${NC}"
