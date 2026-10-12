# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-12

### Added
- **Core Voice Recording Engine**:
  - Web Audio API and MediaRecorder integration targeting Opus in Ogg/WebM container at 64 kbps.
  - Real-time amplitude metering with AnalyserNode.
  - Fast RMS waveform analysis and dynamic normalization.
  - Base64 waveform encoding adhering to Discord's $\le 256$ bins specification.
- **Discord Integration**:
  - ChatBar microphone button injection.
  - Full-featured recording panel with recording timer, waveform indicator, preview player, and cancel controls.
  - Native Discord voice message payload generator using flag 8192 (`IS_VOICE_MESSAGE`), `duration_secs`, and `waveform`.
  - Graceful fallback mode to upload as a standard audio attachment when native voice notes are not supported in a channel.
- **Debian Packaging & Tooling**:
  - Complete `.deb` packaging infrastructure (`dpkg-deb`).
  - Diagnostic script (`scripts/doctor.sh`) checking architecture, OS, audio daemons, Discord client, and Vencord.
  - Automated installer script (`scripts/install.sh`) supporting `--userplugin`, `--setup-vencord`, `--vencord-src`.
  - Reversible restoration and uninstallation scripts (`scripts/restore-discord.sh`, `scripts/uninstall.sh`).
  - Automated unit test suite with 32 test cases.
