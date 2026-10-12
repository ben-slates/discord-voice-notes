#!/usr/bin/env bash
# Package builder for Discord Voice Notes Debian package (.deb)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [Discord Voice Notes] Building Debian Package ==="
cd "${ROOT_DIR}"

# Step 1: Ensure project is built
echo "--> Step 1: Ensuring build artifacts are up to date..."
bash "${ROOT_DIR}/scripts/build.sh"

# Step 2: Run tests
echo "--> Step 2: Running automated test suite..."
npm test

# Step 3: Prepare package staging directory
STAGE_DIR="${ROOT_DIR}/dist/staging"
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}/DEBIAN"
mkdir -p "${STAGE_DIR}/usr/bin"
mkdir -p "${STAGE_DIR}/usr/share/discord-voice-notes/plugin"
mkdir -p "${STAGE_DIR}/usr/share/discord-voice-notes/scripts"
mkdir -p "${STAGE_DIR}/usr/share/doc/discord-voice-notes"

echo "--> Step 3: Assembling files into Debian staging structure..."

# Copy DEBIAN maintainer scripts
cp "${ROOT_DIR}/debian/postinst" "${STAGE_DIR}/DEBIAN/postinst"
cp "${ROOT_DIR}/debian/prerm" "${STAGE_DIR}/DEBIAN/prerm"
chmod 755 "${STAGE_DIR}/DEBIAN/postinst" "${STAGE_DIR}/DEBIAN/prerm"

# Create /usr/bin/discord-voice-notes CLI entry point
cat << 'EOF' > "${STAGE_DIR}/usr/bin/discord-voice-notes"
#!/usr/bin/env bash
# Discord Voice Notes CLI Wrapper
set -e
SHARE_DIR="/usr/share/discord-voice-notes"
if [ -f "${SHARE_DIR}/setup.sh" ]; then
    exec bash "${SHARE_DIR}/setup.sh" "$@"
elif [ -f "${SHARE_DIR}/scripts/setup.sh" ]; then
    exec bash "${SHARE_DIR}/scripts/setup.sh" "$@"
elif [ -f "${SHARE_DIR}/scripts/install.sh" ]; then
    exec bash "${SHARE_DIR}/scripts/install.sh" "$@"
else
    echo "Error: ${SHARE_DIR}/setup.sh not found." >&2
    exit 1
fi
EOF
chmod 755 "${STAGE_DIR}/usr/bin/discord-voice-notes"

# Copy pre-compiled plugin bundles
cp -rf "${ROOT_DIR}/dist/plugin/"* "${STAGE_DIR}/usr/share/discord-voice-notes/plugin/"

# Copy full TypeScript source tree
cp -rf "${ROOT_DIR}/src" "${STAGE_DIR}/usr/share/discord-voice-notes/"

# Copy setup and runtime scripts
cp -f "${ROOT_DIR}/setup.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/"
chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/setup.sh"
cp -f "${ROOT_DIR}/setup.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
cp -f "${ROOT_DIR}/scripts/install.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
cp -f "${ROOT_DIR}/scripts/doctor.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
cp -f "${ROOT_DIR}/scripts/restore-discord.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
cp -f "${ROOT_DIR}/scripts/uninstall.sh" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
if [ -f "${ROOT_DIR}/scripts/patch-vencord.cjs" ]; then
    cp -f "${ROOT_DIR}/scripts/patch-vencord.cjs" "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"
    chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/patch-vencord.cjs"
fi
chmod 755 "${STAGE_DIR}/usr/share/discord-voice-notes/scripts/"*.sh

# Copy themes
if [ -d "${ROOT_DIR}/themes" ]; then
    cp -rf "${ROOT_DIR}/themes" "${STAGE_DIR}/usr/share/discord-voice-notes/"
fi

# Copy offline Vencord runtime dist
if [ -d "${ROOT_DIR}/vencord" ]; then
    cp -rf "${ROOT_DIR}/vencord" "${STAGE_DIR}/usr/share/discord-voice-notes/"
fi

# Copy manifests and docs
cp -f "${ROOT_DIR}/dist/source-manifest.json" "${STAGE_DIR}/usr/share/discord-voice-notes/"
cp -f "${ROOT_DIR}/package.json" "${STAGE_DIR}/usr/share/discord-voice-notes/"
cp -f "${ROOT_DIR}/README.md" "${STAGE_DIR}/usr/share/discord-voice-notes/"
cp -f "${ROOT_DIR}/LICENSE" "${STAGE_DIR}/usr/share/discord-voice-notes/"

# Documentation in /usr/share/doc/discord-voice-notes
cp -f "${ROOT_DIR}/README.md" "${STAGE_DIR}/usr/share/doc/discord-voice-notes/"
cp -f "${ROOT_DIR}/debian/copyright" "${STAGE_DIR}/usr/share/doc/discord-voice-notes/copyright"

# Debian changelog
cat << 'EOF' | gzip -9 -c > "${STAGE_DIR}/usr/share/doc/discord-voice-notes/changelog.Debian.gz"
discord-voice-notes (1.0.0-1) trixie; urgency=medium

  * Initial release for Debian 12 (Bookworm) and Debian 13 (Trixie).
  * Web Audio and MediaRecorder integration with Opus in Ogg/WebM container.
  * Real-time waveform computation and Base64 encoding.
  * Native voice message flag 8192 (IS_VOICE_MESSAGE) support with fallback.
  * Automatic diagnostic and recovery utilities included.

 -- Discord Voice Notes Contributors <contact@discord-voice-notes.local>  Mon, 12 Oct 2026 18:00:00 +0000
EOF

# Calculate installed size for control file
INSTALLED_SIZE=$(du -sk "${STAGE_DIR}" | cut -f1)

cat << EOF > "${STAGE_DIR}/DEBIAN/control"
Package: discord-voice-notes
Version: 1.0.0-1
Section: sound
Priority: optional
Architecture: all
Installed-Size: ${INSTALLED_SIZE}
Maintainer: Discord Voice Notes Contributors <contact@discord-voice-notes.local>
Depends: nodejs (>= 18.0.0), curl, alsa-utils | pipewire-alsa | pulseaudio-utils
Recommends: libnotify-bin
Suggests: dialog
Description: Native voice message recording add-on for Discord Linux
 Discord Voice Notes provides a non-invasive, open-source client add-on
 enabling native voice message recording, waveform visualization, audio
 preview, and upload integration within the official Discord Linux application.
 .
 Features:
  * Audio recording via Web Audio and MediaRecorder APIs (Opus in Ogg/WebM).
  * Real-time waveform computation and Base64 metadata encoding.
  * Integration with Discord composer toolbar.
  * System diagnostics tool (discord-voice-notes --doctor).
  * 100% reversible modification and recovery tools.
EOF

# Step 4: Build Debian package
echo "--> Step 4: Generating .deb package via dpkg-deb..."
DEB_NAME="discord-voice-notes.deb"
dpkg-deb --build --root-owner-group "${STAGE_DIR}" "${ROOT_DIR}/dist/${DEB_NAME}"

# Copy to root of repository for convenience
cp -f "${ROOT_DIR}/dist/${DEB_NAME}" "${ROOT_DIR}/${DEB_NAME}"

# Set permissions so apt and any user can read it without permission denied
chmod 644 "${ROOT_DIR}/dist/${DEB_NAME}"
chmod 644 "${ROOT_DIR}/${DEB_NAME}"

echo "    [OK] Debian package created successfully:"
echo "         - ${ROOT_DIR}/dist/${DEB_NAME}"
echo "         - ${ROOT_DIR}/${DEB_NAME}"

# Step 5: Verify package contents
echo "--> Step 5: Verifying package metadata..."
dpkg-deb --info "${ROOT_DIR}/${DEB_NAME}"

echo ""
echo "=== [Discord Voice Notes] Package Build Completed ==="
