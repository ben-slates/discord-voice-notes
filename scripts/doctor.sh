#!/usr/bin/env bash
# Discord Voice Notes - System Health and Diagnostic Tool for Debian/Kali Linux

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() {
    echo -e "  [${GREEN}OK${NC}] $1"
}

fail() {
    echo -e "  [${RED}FAIL${NC}] $1"
}

warn() {
    echo -e "  [${YELLOW}WARN${NC}] $1"
}

info() {
    echo -e "  [${BLUE}INFO${NC}] $1"
}

TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME=$(getent passwd "${TARGET_USER}" 2>/dev/null | cut -d: -f6 || true)
if [ -z "${TARGET_HOME}" ]; then
    TARGET_HOME="${HOME}"
fi

echo "=========================================================="
echo "    Discord Voice Notes - System Diagnostic (Doctor)     "
echo "=========================================================="
echo -e "${BLUE}Inspecting for user:${NC} ${TARGET_USER} (${TARGET_HOME})"
echo ""

FATAL_ERRORS=0
WARNINGS=0

echo "1. Operating System & Hardware Architecture:"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="${PRETTY_NAME:-$NAME}"
    OS_VERSION_ID="${VERSION_ID:-}"
    info "Detected OS: ${OS_NAME}"

    if [[ "${ID:-}" == "debian" || "${ID_LIKE:-}" =~ debian ]]; then
        if [[ "${OS_VERSION_ID}" == "12"* ]]; then
            pass "Debian 12 (Bookworm) detected - fully supported."
        elif [[ "${OS_VERSION_ID}" == "13"* ]]; then
            pass "Debian 13 (Trixie) detected - fully supported."
        elif [[ "${ID:-}" == "kali" || "${ID_LIKE:-}" =~ kali ]]; then
            pass "Kali Linux (Debian-based) detected - supported."
        else
            info "Debian-based system detected (${OS_VERSION_ID:-rolling}). Compatible with Debian package."
        fi
    else
        warn "Non-Debian distribution detected (${ID:-}). Some packaging features may not apply."
        ((WARNINGS++))
    fi
else
    warn "Could not read /etc/os-release."
    ((WARNINGS++))
fi

ARCH=$(uname -m)
if [ "${ARCH}" = "x86_64" ]; then
    pass "CPU Architecture is x86_64 (amd64) - supported."
else
    fail "CPU Architecture is ${ARCH}. Official Discord Linux .deb targets x86_64."
    ((FATAL_ERRORS++))
fi
echo ""

echo "2. Runtime and Build Dependencies:"
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo "${NODE_VERSION}" | sed -E 's/v([0-9]+).*/\1/')
    if [ "${NODE_MAJOR}" -ge 18 ]; then
        pass "Node.js ${NODE_VERSION} is installed (>= 18)."
    else
        warn "Node.js ${NODE_VERSION} is older than recommended (>= 18)."
        ((WARNINGS++))
    fi
else
    fail "Node.js is not found in PATH."
    ((FATAL_ERRORS++))
fi

if command -v npm >/dev/null 2>&1; then
    pass "npm is installed: $(npm -v)"
else
    warn "npm is not installed."
    ((WARNINGS++))
fi

if command -v dpkg-deb >/dev/null 2>&1; then
    pass "dpkg-deb is available for Debian packaging."
else
    warn "dpkg-deb not found. Install 'dpkg' package."
    ((WARNINGS++))
fi
echo ""

echo "3. Linux Audio Subsystems:"
AUDIO_SUBSYSTEM_FOUND=0

if command -v pw-cli >/dev/null 2>&1 || pgrep -x "pipewire" >/dev/null 2>&1; then
    pass "PipeWire audio subsystem detected."
    AUDIO_SUBSYSTEM_FOUND=1
fi

if command -v pactl >/dev/null 2>&1 || pgrep -x "pulseaudio" >/dev/null 2>&1; then
    pass "PulseAudio audio subsystem detected."
    AUDIO_SUBSYSTEM_FOUND=1
fi

if command -v arecord >/dev/null 2>&1; then
    pass "ALSA record utilities (arecord) available."
    AUDIO_SUBSYSTEM_FOUND=1
fi

if [ ${AUDIO_SUBSYSTEM_FOUND} -eq 0 ]; then
    warn "No active audio daemon (PipeWire/PulseAudio) detected in this session."
    warn "Audio recording requires an active sound server (or ALSA) when running Discord."
    ((WARNINGS++))
fi
echo ""

echo "4. Official Discord Linux Application:"
DISCORD_PATH=""
FOUND_ASAR=""

if command -v discord >/dev/null 2>&1; then
    DISCORD_BIN=$(command -v discord)
    RESOLVED_BIN=$(readlink -f "${DISCORD_BIN}" 2>/dev/null || echo "${DISCORD_BIN}")
    RESOLVED_DIR=$(dirname "${RESOLVED_BIN}")
    if [ -f "${RESOLVED_DIR}/resources/app.asar" ]; then
        DISCORD_PATH="${RESOLVED_DIR}"
        FOUND_ASAR="${RESOLVED_DIR}/resources/app.asar"
    fi
fi

CANDIDATES=("/opt/discord" "/usr/share/discord" "/usr/lib/discord" "${TARGET_HOME}/.local/share/discord")

if [ -z "${DISCORD_PATH}" ]; then
    for DIR in "${CANDIDATES[@]}"; do
        if [ -f "${DIR}/resources/app.asar" ]; then
            DISCORD_PATH="${DIR}"
            FOUND_ASAR="${DIR}/resources/app.asar"
            break
        fi
    done
fi

if [ -z "${DISCORD_PATH}" ]; then
    for DIR in "${CANDIDATES[@]}"; do
        if [ -d "${DIR}" ]; then
            DISCORD_PATH="${DIR}"
            break
        fi
    done
fi

if [ -n "${DISCORD_PATH}" ]; then
    pass "Discord application found at: ${DISCORD_PATH}"

    if [ -n "${FOUND_ASAR}" ] && [ -f "${FOUND_ASAR}" ]; then
        ASAR_SIZE=$(stat -c%s "${FOUND_ASAR}" 2>/dev/null || stat -f%z "${FOUND_ASAR}" 2>/dev/null || echo "unknown")
        pass "Discord app.asar found (${ASAR_SIZE} bytes)."
    else
        MODULAR_ASAR=$(find "${TARGET_HOME}/.config/discord" -name "core.asar" -o -name "app.asar" 2>/dev/null | head -n 1 || true)
        if [ -n "${MODULAR_ASAR}" ]; then
            pass "Discord modular core found at: ${MODULAR_ASAR}"
        else
            warn "Discord app.asar not found in ${DISCORD_PATH}/resources/."
            ((WARNINGS++))
        fi
    fi

    if [ -d "${DISCORD_PATH}/resources/app" ]; then
        info "Discord resources/app wrapper folder exists (client modification active)."
    else
        info "Discord is currently vanilla (no client modification wrapper in resources/app)."
    fi
else
    warn "Official Discord desktop application not found in standard system locations."
    warn "Download official .deb from: https://discord.com/api/download?platform=linux&format=deb"
    ((WARNINGS++))
fi
echo ""

echo "5. Vencord Client Modification Status:"
VENCORD_USER_DIR="${TARGET_HOME}/.config/Vencord"
if [ -d "${VENCORD_USER_DIR}" ]; then
    pass "Vencord configuration folder found: ${VENCORD_USER_DIR}"
    if [ -d "${VENCORD_USER_DIR}/userplugins/DiscordVoiceNotes" ]; then
        pass "DiscordVoiceNotes userplugin directory is present in Vencord."
    else
        info "DiscordVoiceNotes userplugin not yet installed."
        info "Run 'discord-voice-notes --userplugin' to install it."
    fi
else
    info "Vencord directory not found at ${VENCORD_USER_DIR}."
    info "To set up Vencord automatically, run:"
    info "    discord-voice-notes --setup-vencord"
fi
echo ""

echo "=========================================================="
if [ ${FATAL_ERRORS} -eq 0 ]; then
    if [ ${WARNINGS} -eq 0 ]; then
        echo -e "${GREEN}Doctor Result: All checks passed! System is ready.${NC}"
    else
        echo -e "${YELLOW}Doctor Result: Passed with ${WARNINGS} warning(s). Review above.${NC}"
    fi
    exit 0
else
    echo -e "${RED}Doctor Result: Found ${FATAL_ERRORS} fatal error(s). Please fix before proceeding.${NC}"
    exit 1
fi
