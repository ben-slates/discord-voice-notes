#!/usr/bin/env bash
# Discord Voice Notes - Recovery & Discord Restoration Tool
# Reverts Discord modifications and restores vanilla Discord client on Debian/Kali Linux.

set -euo pipefail

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
echo "    Discord Voice Notes - Restore Vanilla Discord         "
echo "=========================================================="
echo -e "${BLUE}Target user:${NC} ${TARGET_USER} (${TARGET_HOME})"
echo ""

# Find Discord install directory
DISCORD_PATH=""
if command -v discord >/dev/null 2>&1; then
    DISCORD_BIN=$(command -v discord)
    RESOLVED_BIN=$(readlink -f "${DISCORD_BIN}" 2>/dev/null || echo "${DISCORD_BIN}")
    RESOLVED_DIR=$(dirname "${RESOLVED_BIN}")
    if [ -d "${RESOLVED_DIR}/resources" ]; then
        DISCORD_PATH="${RESOLVED_DIR}"
    fi
fi

CANDIDATES=("/opt/discord" "/usr/share/discord" "/usr/lib/discord" "${TARGET_HOME}/.local/share/discord")
if [ -z "${DISCORD_PATH}" ]; then
    for DIR in "${CANDIDATES[@]}"; do
        if [ -d "${DIR}/resources" ]; then
            DISCORD_PATH="${DIR}"
            break
        fi
    done
fi

RESTORED_SOMETHING=0

# 1. Check for client mod wrappers in resources/app
if [ -n "${DISCORD_PATH}" ] && [ -d "${DISCORD_PATH}/resources" ]; then
    echo "--> Inspecting Discord resources at: ${DISCORD_PATH}/resources"

    # If resources/app is a folder (typical Vencord / client mod hook)
    if [ -d "${DISCORD_PATH}/resources/app" ]; then
        echo -e "${YELLOW}--> Removing modification wrapper: ${DISCORD_PATH}/resources/app${NC}"
        if [ "$(id -u)" -eq 0 ]; then
            rm -rf "${DISCORD_PATH}/resources/app"
        else
            echo "Requesting root permission to remove ${DISCORD_PATH}/resources/app..."
            sudo rm -rf "${DISCORD_PATH}/resources/app"
        fi
        echo -e "${GREEN}    [OK] Modification wrapper removed.${NC}"
        RESTORED_SOMETHING=1
    fi

    # If _app.asar exists (Vencord patcher convention)
    if [ -f "${DISCORD_PATH}/resources/_app.asar" ]; then
        echo -e "${YELLOW}--> Restoring original app.asar from _app.asar...${NC}"
        if [ "$(id -u)" -eq 0 ]; then
            rm -f "${DISCORD_PATH}/resources/app.asar"
            mv -f "${DISCORD_PATH}/resources/_app.asar" "${DISCORD_PATH}/resources/app.asar"
        else
            sudo rm -f "${DISCORD_PATH}/resources/app.asar"
            sudo mv -f "${DISCORD_PATH}/resources/_app.asar" "${DISCORD_PATH}/resources/app.asar"
        fi
        echo -e "${GREEN}    [OK] Vanilla app.asar restored.${NC}"
        RESTORED_SOMETHING=1
    fi

    # If app.asar.bak exists and app.asar is modified
    if [ -f "${DISCORD_PATH}/resources/app.asar.bak" ]; then
        echo -e "${YELLOW}--> Restoring original app.asar from backup...${NC}"
        if [ "$(id -u)" -eq 0 ]; then
            mv -f "${DISCORD_PATH}/resources/app.asar.bak" "${DISCORD_PATH}/resources/app.asar"
        else
            sudo mv -f "${DISCORD_PATH}/resources/app.asar.bak" "${DISCORD_PATH}/resources/app.asar"
        fi
        echo -e "${GREEN}    [OK] Vanilla app.asar restored.${NC}"
        RESTORED_SOMETHING=1
    fi
fi

# 2. Check for Vencord uninstaller CLI if available
if command -v vencordinstaller >/dev/null 2>&1; then
    echo "--> Running system Vencord uninstaller..."
    vencordinstaller -uninstall || true
    RESTORED_SOMETHING=1
elif [ -f "/tmp/VencordInstallerCli-linux" ]; then
    echo "--> Running cached Vencord CLI uninstaller..."
    /tmp/VencordInstallerCli-linux -uninstall || true
    RESTORED_SOMETHING=1
fi

# 3. Clean up userplugin if requested or present
USERPLUGIN_DIR="${TARGET_HOME}/.config/Vencord/userplugins/DiscordVoiceNotes"
if [ -d "${USERPLUGIN_DIR}" ]; then
    read -r -p "Remove userplugin files from ${USERPLUGIN_DIR}? [Y/n] " CONFIRM || CONFIRM="y"
    if [[ "${CONFIRM}" =~ ^[Yy] ]] || [ -z "${CONFIRM}" ]; then
        rm -rf "${USERPLUGIN_DIR}"
        echo -e "${GREEN}    [OK] Userplugin removed from ${USERPLUGIN_DIR}${NC}"
        RESTORED_SOMETHING=1
    fi
fi

echo ""
if [ ${RESTORED_SOMETHING} -gt 0 ]; then
    echo -e "${GREEN}Restoration complete: Discord has been returned to its vanilla state.${NC}"
    echo "Please restart Discord if it is currently running."
else
    echo -e "${BLUE}No active client modifications were found. Discord appears to already be vanilla.${NC}"
fi
