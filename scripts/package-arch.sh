#!/usr/bin/env bash
# ==============================================================================
#  Package builder for Discord Voice Notes Arch Linux package (.pkg.tar.zst)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [Discord Voice Notes] Building Arch Linux Package ==="
cd "${ROOT_DIR}"

# Step 1: Ensure project is built
if [ -f "${ROOT_DIR}/scripts/build.sh" ]; then
    bash "${ROOT_DIR}/scripts/build.sh"
fi

# Step 2: Prepare staging directory
STAGE_DIR="${ROOT_DIR}/dist/arch-staging"
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}/usr/bin"
mkdir -p "${STAGE_DIR}/usr/share/discord-voice-notes/scripts"
mkdir -p "${STAGE_DIR}/usr/share/discord-voice-notes/themes"
mkdir -p "${STAGE_DIR}/usr/share/doc/discord-voice-notes"
mkdir -p "${STAGE_DIR}/usr/share/licenses/discord-voice-notes"

# Create /usr/bin/discord-voice-notes CLI wrapper
cat << 'EOF' > "${STAGE_DIR}/usr/bin/discord-voice-notes"
#!/usr/bin/env bash
# Discord Voice Notes CLI Wrapper for Arch Linux
set -e
SHARE_DIR="/usr/share/discord-voice-notes"
if [ -f "${SHARE_DIR}/setup.sh" ]; then
    exec bash "${SHARE_DIR}/setup.sh" "$@"
elif [ -f "${SHARE_DIR}/scripts/setup.sh" ]; then
    exec bash "${SHARE_DIR}/scripts/setup.sh" "$@"
else
    echo "Error: ${SHARE_DIR}/setup.sh not found." >&2
    exit 1
fi
EOF
chmod 755 "${STAGE_DIR}/usr/bin/discord-voice-notes"

# Copy files
cp -f "${ROOT_DIR}/setup.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/"
chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/setup.sh"

cp -rf "${ROOT_DIR}/scripts/"* "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"*.sh 2>/dev/null || true
if [ -f "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/patch-vencord.cjs" ]; then
    chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/patch-vencord.cjs"
fi

if [ -d "${ROOT_DIR}/themes" ]; then
    cp -rf "${ROOT_DIR}/themes/"* "${STAGE_DIR}/usr/share/discord-voice-notes/themes/"
fi

if [ -d "${ROOT_DIR}/vencord" ]; then
    cp -rf "${ROOT_DIR}/vencord" "${STAGE_DIR}/usr/share/discord-voice-notes/"
fi

if [ -d "${ROOT_DIR}/dist/plugin" ]; then
    mkdir -p "${STAGE_DIR}/usr/share/discord-voice-notes/plugin"
    cp -rf "${ROOT_DIR}/dist/plugin/"* "${STAGE_DIR}/usr/share/discord-voice-notes/plugin/"
fi

if [ -d "${ROOT_DIR}/src" ]; then
    cp -rf "${ROOT_DIR}/src" "${STAGE_DIR}/usr/share/discord-voice-notes/"
fi

cp -f "${ROOT_DIR}/package.json" "${STAGE_DIR}/usr/share/discord-voice-notes/"
cp -f "${ROOT_DIR}/README.md" "${STAGE_DIR}/usr/share/doc/discord-voice-notes/README.md"
cp -f "${ROOT_DIR}/LICENSE" "${STAGE_DIR}/usr/share/licenses/discord-voice-notes/LICENSE"

# Calculate installed size in bytes
INSTALLED_SIZE=$(du -sb "${STAGE_DIR}" | cut -f1)

# Generate .PKGINFO
BUILD_DATE=$(date +%s)
cat << EOF > "${STAGE_DIR}/.PKGINFO"
format = 2
pkgname = discord-voice-notes
pkgbase = discord-voice-notes
pkgver = 1.0.0-1
pkgdesc = Native voice message recording add-on & Vencord manager for Discord on Linux (Arch / Manjaro)
url = https://github.com/ben-slates/discord-voice-notes
builddate = ${BUILD_DATE}
packager = Ben Slates <contact@discord-voice-notes.local>
size = ${INSTALLED_SIZE}
arch = any
license = MIT
depend = nodejs>=18.0.0
depend = curl
depend = sox
depend = alsa-utils
optdepend = discord: Official Discord client from extra repository
optdepend = libnotify: Desktop notifications
provides = discord-voice-notes
makepkgopt = strip
EOF

# Copy install scriptlet as .INSTALL
if [ -f "${ROOT_DIR}/arch/discord-voice-notes.install" ]; then
    cp -f "${ROOT_DIR}/arch/discord-voice-notes.install" "${STAGE_DIR}/.INSTALL"
fi

# Step 3: Archive with tar and compress with zstd
PKG_NAME="discord-voice-notes-1.0.0-1-any.pkg.tar.zst"
OUTPUT_PKG="${ROOT_DIR}/dist/${PKG_NAME}"

echo "--> Compressing Arch Linux package with zstd..."
(
    cd "${STAGE_DIR}"
    # Standard Arch packages include .PKGINFO and .INSTALL first
    tar --sort=name --owner=0 --group=0 --numeric-owner \
        -cf - .PKGINFO $([ -f .INSTALL ] && echo ".INSTALL") usr | \
        zstd -c -T0 -19 > "${OUTPUT_PKG}"
)

cp -f "${OUTPUT_PKG}" "${ROOT_DIR}/${PKG_NAME}"

echo -e "\n[OK] Arch Linux package created successfully:"
echo "     - ${OUTPUT_PKG}"
echo "     - ${ROOT_DIR}/${PKG_NAME}"
echo "To install on Arch Linux / Manjaro:"
echo "     sudo pacman -U ${PKG_NAME}"
