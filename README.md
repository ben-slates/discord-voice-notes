# Discord Voice Notes for Debian Linux

A Debian-compatible add-on that enables users of the official Discord Linux desktop application to record, preview, and send native Discord voice messages with real-time waveform visualization.

## Key Features

- **Microphone Composer Button**: Injects an intuitive microphone icon adjacent to the Discord message composer.
- **Recording Controls**: Real-time timer, pulsating recording status indicator, stop, cancel, and preview playback.
- **Discord-Compliant Audio**: Encodes audio via Web Audio and MediaRecorder in Opus (`audio/ogg` or `audio/webm`) at 64 kbps.
- **Waveform Analysis**: Computes amplitude bins ($\le 256$ bins, ~10 samples/sec), normalizes via dynamic range expansion, and generates the exact Base64 waveform string required by Discord.
- **Native Voice Message Dispatch**: Transmits files using message flag `8192` (`IS_VOICE_MESSAGE`) along with duration and waveform metadata.
- **Normal Attachment Fallback**: Toggle to fall back to standard audio attachment upload if a channel restricts voice messages.
- **100% Client-Side & Secure**: Zero credential harvesting, zero token interception, and no external servers.
- **Non-Invasive & Reversible**: Can be enabled, disabled, or completely uninstalled with single-line commands.

---

## Installation Guide

### Method 1: Using the Debian Package (.deb) (Recommended)

1. **Install the Debian package**:
   ```bash
   sudo apt install ./discord-voice-notes.deb
   ```
   *(Or using dpkg: `sudo dpkg -i ./discord-voice-notes.deb && sudo apt install -f`)*

2. **Run the Diagnostic Doctor**:
   ```bash
   discord-voice-notes --doctor
   ```

3. **Interactive Setup Script (Same Experience as Windows EXE)**:
   You can run the interactive setup tool anytime:
   ```bash
   sudo ./setup.sh
   # OR after installing the .deb package:
   sudo discord-voice-notes
   ```
   This opens the interactive CLI menu:
   - `[1]` Install Voice Notes & Vencord (Standard)
   - `[2]` Install Voice Notes + Enable Free Nitro (FakeNitro & Profile Themes)
   - `[3]` Install Custom Themes (New Kemono Friends & GGO Kirito)
   - `[4]` Run System Diagnostics (Doctor)
   - `[5]` Restore Vanilla Discord (Unpatch / Revert)
   - `[6]` Exit

4. **Activate in Discord**:
   - Open Discord.
   - In any chat, right-click the '+' attachment button and click 'Send Voice Message', or use the dedicated microphone button in the toolbar.
   - If FakeNitro was selected, custom emojis, stickers, and 1080p 60FPS streaming are immediately unlocked!

---

### Method 2: Windows Native CLI Installer (.exe)

For Windows 10/11 users, a standalone native Windows executable is included:

1. Download `DiscordVoiceNotesInstaller.exe`.
2. Double-click to launch (or run from Command Prompt / PowerShell).
3. Select from the interactive menu:
   - `[1]` Install Voice Notes & Vencord Runtime
   - `[2]` Install Voice Notes + Enable Free Nitro (FakeNitro)
   - `[3]` Run Diagnostics & Doctor check
   - `[4]` Restore Vanilla Discord (Unpatch)
4. The tool automatically locates Discord in `%LOCALAPPDATA%\Discord\app-*`, patches it offline, enables `VoiceMessages` in Vencord settings, and configures the environment.

---

### Method 3: Manual / Development Installation

```bash
# Clone or extract archive
cd discord-voice-notes

# Install build dependencies
npm install

# Compile plugin bundles
npm run build

# Run automated tests
npm test

# Copy pre-compiled plugin to your user profile
bash scripts/install.sh --userplugin
```

---

## Command Line Reference

The `discord-voice-notes` CLI utility provides the following actions:

| Command | Description |
|---|---|
| `discord-voice-notes --doctor` | Performs a system diagnosis of OS, Node, audio daemons, Discord client, and Vencord. |
| `discord-voice-notes --userplugin` | Copies pre-compiled plugin to `~/.config/Vencord/userplugins/DiscordVoiceNotes`. |
| `discord-voice-notes --setup-vencord` | Downloads official Vencord installer CLI, patches Discord, and registers plugin. |
| `discord-voice-notes --vencord-src <DIR>`| Copies plugin source into a local clone of Vencord (`src/userplugins/`). |
| `discord-voice-notes --restore` | Reverts all client modifications and restores Discord to its original vanilla state. |
| `discord-voice-notes --help` | Displays command line usage information. |

---

## Project Structure

```
discord-voice-notes/
├── README.md               # User manual and setup documentation
├── LICENSE                 # MIT Open Source License
├── CHANGELOG.md            # Version changelog
├── Makefile                # Build automation targets
├── package.json            # Node project configuration and dependencies
├── tsconfig.json           # TypeScript strict compiler configuration
├── src/
│   ├── audio/              # Audio recording & waveform calculation
│   │   ├── recorder.ts     # MediaRecorder & Web Audio lifecycle controller
│   │   └── waveform.ts     # RMS waveform generation & Base64 encoding
│   ├── discord/            # Discord API & upload integrations
│   │   ├── types.ts        # Message flags (IS_VOICE_MESSAGE = 8192) & types
│   │   └── uploader.ts     # CloudUpload and message posting integration
│   ├── components/         # React UI components
│   │   ├── Icons.tsx       # Microphone, wave, and control SVG icons
│   │   ├── VoiceNotes.css  # Native Discord styling & animations
│   │   └── VoicePanel.tsx  # Floating recording & preview panel
│   └── plugin/             # Vencord plugin registration
│       ├── VoiceBarButton.tsx # Toolbar composer button injection
│       └── index.ts        # Main Vencord plugin export
├── tests/                  # Automated unit test suite
│   ├── waveform.test.ts    # Waveform and Base64 algorithm tests
│   ├── recording.test.ts   # Audio controller state machine tests
│   └── protocol.test.ts    # Discord protocol & upload tests
├── themes/                 # Vencord & BetterDiscord custom themes
│   ├── NewKemonoFriends.theme.css  # Fixed & modernized Kemono Friends theme
│   ├── GGOKirito.theme.css         # Fixed & modernized GGO Kirito theme
│   ├── OldAkameGaKill.theme.css    # Fixed & modernized Old Akame Ga Kill theme
│   ├── NewAkameGaKill.theme.css    # Fixed & modernized New Akame Ga Kill theme
│   └── assets/             # Bundled CSP-friendly assets & background images
├── scripts/                # Utility and administration scripts
│   ├── build.sh            # Bundles TypeScript to ESM & CJS via esbuild
│   ├── package.sh          # Builds Debian .deb package
│   ├── doctor.sh           # System health and diagnostic checker
│   ├── install.sh          # Plugin installation assistant
│   ├── uninstall.sh        # Uninstaller script
│   └── restore-discord.sh  # Vanilla Discord restoration script
└── debian/                 # Debian packaging definitions
    ├── control             # Package dependencies and metadata
    ├── rules               # debhelper build rules
    ├── postinst            # Post-installation hook
    ├── prerm               # Pre-removal hook
    └── copyright           # Debian copyright declaration
```

---

## Command Line Flags & Options (`setup.sh`)

Both `setup.sh` and the installed `discord-voice-notes` command support full CLI flags:

| Flag | Short | Action |
|------|-------|--------|
| `--install` | `-1`, `-i` | Standard Voice Notes & Vencord offline install |
| `--nitro` | `-2`, `-n` | Voice Notes + auto-enable Free Nitro (FakeNitro & Profile Themes) |
| `--themes` | `-3`, `-t` | Deploy all 4 bundled custom themes to `~/.config/Vencord/themes/` |
| `--doctor` | `-4`, `-d` | Run system diagnostics and audio checks |
| `--restore` | `-5`, `-r` | Restore Discord to stock vanilla state (unpatch) |
| `--clean` | `-6`, `-c` | Complete clean wipe (restores Discord, removes Vencord, clears caches) |
| `--non-interactive` | `-y` | Run unattended in batch mode without interactive confirmation prompts |
| `--help` | `-h` | Display complete help and usage documentation |

---

## Custom Themes

The repository includes pre-configured, modernized themes in `themes/`:

- **New Kemono Friends Theme (`themes/NewKemonoFriends.theme.css`)**:
  - Fully compatible with modern Discord builds and Visual Refresh.
  - Fixes CSP ("unknown source") image loading issues with direct reliable hosting and universal CSS background hooks.

- **GGO Kirito Theme (`themes/GGOKirito.theme.css`)**:
  - Fully inlined and offline-ready (removes brittle `raw.githack.com` external `@import`).
  - Bundles the 2834×1464 high-resolution GGO Kirito background locally to bypass Discord CSP errors.

- **Old Akame Ga Kill Theme (`themes/OldAkameGaKill.theme.css`)**:
  - Classic Akame Ga Kill dark aesthetic updated for modern Discord & Visual Refresh.
  - Bundles the 1920×1080 background locally without external CDN dependencies.

- **New Akame Ga Kill! Theme (`themes/NewAkameGaKill.theme.css`)**:
  - Modernized Akame Ga Kill theme with enhanced transparency and custom accent colors.
  - Bundles the 2000×1200 background asset locally.

### How to Install Themes:
- **Automatic**: Run `sudo ./setup.sh --themes` (or select Option 3 in the interactive menu).
- **Manual**: Copy any `.theme.css` file into `~/.config/Vencord/themes/` (Linux) or `%APPDATA%\Vencord\themes\` (Windows).
- In Discord, go to **User Settings** -> **Vencord** -> **Themes** and toggle on your desired theme.

---

## Restoration & Complete Wipe

To return Discord to its vanilla state:
```bash
sudo ./setup.sh --restore
# OR: discord-voice-notes --restore
```

To **completely wipe** all Vencord runtime, plugins, themes, and caches for a fresh start:
```bash
sudo ./setup.sh --clean
```

To remove the Debian package:
```bash
sudo apt purge discord-voice-notes
```

---

## License

This project is licensed under the [MIT License](LICENSE).
