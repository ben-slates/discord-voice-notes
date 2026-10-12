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

### Method 1: Linux Distributions (Debian, Arch, Ubuntu, Kali, Manjaro)

#### Option A: Arch Linux / Manjaro (Pacman / PKGBUILD)
1. **Install via Pacman package**:
   ```bash
   sudo pacman -U ./discord-voice-notes-1.0.0-1-any.pkg.tar.zst
   ```
2. **Or build using PKGBUILD**:
   ```bash
   cd arch && makepkg -si
   ```

#### Option B: Debian / Kali / Ubuntu (.deb)
1. **Install via APT / dpkg**:
   ```bash
   sudo apt install ./discord-voice-notes.deb
   # OR: sudo dpkg -i ./discord-voice-notes.deb && sudo apt install -f
   ```

#### Option C: Universal Multi-Distro Script (`setup.sh`)
On any Linux distribution (Arch, Debian, Ubuntu, Kali, Fedora, etc.):
```bash
sudo ./setup.sh
# OR after package installation:
sudo discord-voice-notes
```
This opens the interactive CLI menu:
- `[1]` Install Voice Notes & Vencord (Standard)
- `[2]` Install Voice Notes + Enable Free Nitro (FakeNitro & Profile Themes)
- `[3]` Install Custom Themes (Kemono Friends, GGO Kirito, Akame Ga Kill)
- `[4]` Run System Diagnostics (Doctor)
- `[5]` Restore Vanilla Discord (Unpatch / Revert)
- `[6]` Complete Clean Wipe (Remove All & Revert to Stock Vanilla)
- `[7]` Exit

#### Activation in Discord:
- Open Discord.
- In any chat, right-click the '+' attachment button and click 'Send Voice Message', or use the microphone button in the toolbar.
- If FakeNitro was selected (Option `[2]`), cross-server emojis, stickers, and 1080p 60FPS streaming are pre-configured and active!

---

### Method 2: Windows Native CLI Installer (.exe)

For Windows 10/11 users, a standalone native Windows executable is included:

1. Run `DiscordVoiceNotesInstaller.exe`.
2. Select from the interactive menu:
   - `[1]` Install Voice Notes & Vencord Runtime
   - `[2]` Install Voice Notes + Enable Free Nitro (FakeNitro)
   - `[3]` Install Custom Themes (Kemono Friends, GGO Kirito, Akame Ga Kill)
   - `[4]` Run Diagnostics & Doctor check
   - `[5]` Restore Vanilla Discord (Unpatch)
   - `[6]` Exit
3. The tool automatically locates Discord in `%LOCALAPPDATA%\Discord\app-*`, patches it offline, enables `VoiceMessages` and `FakeNitro` in Vencord settings, deploys custom themes, and configures the environment.

---

### Vencord Free Nitro & Soundboard Mechanics

When Option `[2]` (or `--nitro`) is selected, Vencord's built-in **`FakeNitro`** and **`FakeProfileThemes`** are pre-configured:

- **Cross-Server Emojis**: Send custom animated and static emojis from any server without a Nitro subscription. Vencord intercepts and transforms them into high-quality Discord CDN links or hyperlinks.
- **Custom Stickers**: Access and send custom stickers in chat.
- **1080p 60FPS / Source Streaming**: Unlocks high-definition, high-framerate screensharing in voice channels and direct calls.
- **Fake Profile Themes**: Customize gradient accents on your profile visible to other users.

#### How Discord Handles Soundboard:
- **Client Picker Unlocked**: In Vencord, the soundboard picker marks sounds as available.
- **Backend Voice Gateway Verification**: Unlike emojis and stickers (which are sent as standard chat message text that Discord accepts), playing a soundboard sound in a live voice channel triggers Discord's WebRTC voice gateway (`GUILD_SOUNDBOARD_SOUND_PLAY`). Discord's **backend voice servers** reject cross-server sound triggers if your account lacks an active paid Nitro subscription.
- **Workaround & Solutions**:
  1. **Server Soundboard Slots**: Upload up to 8 of your favorite soundboard sounds directly to your own server or friend's server. Sounds native to the server can be played by *anyone* in the voice call for free without Nitro!
  2. **Native Voice Notes**: With this plugin installed, you can record or upload any sound clip and send it instantly as an authentic Discord Voice Note in chat!

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
├── themes/                 # Modernized Vencord custom themes
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
├── arch/                   # Arch Linux packaging definitions
│   ├── PKGBUILD            # makepkg build recipe
│   └── discord-voice-notes.install # Arch post-installation hook
├── debian/                 # Debian packaging definitions
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
| `--install` | `-1`, `-i`, `--standard` | Standard Voice Notes & Vencord offline install |
| `--nitro` | `-2`, `-n`, `--fake-nitro` | Voice Notes + auto-enable Free Nitro (FakeNitro & Profile Themes) |
| `--themes` | `-3`, `-t` | Deploy all 4 bundled custom themes to Vencord (`~/.config/Vencord/themes/`) |
| `--doctor` | `-4`, `-d`, `--diagnostics` | Run comprehensive system diagnostics and audio checks |
| `--restore` | `-5`, `-r`, `--revert` | Restore Discord to stock vanilla state (unpatch) |
| `--clean` | `-6`, `-c`, `--wipe` | Complete clean wipe (restores Discord, removes Vencord, clears caches) |
| `--non-interactive` | `-y`, `--yes` | Run unattended in batch mode without interactive confirmation prompts |
| `--help` | `-h` | Display complete help and usage documentation |

---

## Custom Themes (Full GGO Engine & DM Transparency)

All four themes in `themes/` are built on the proven **GGO Kirito glass engine** and share full transparency architecture across all views:

- **Complete Direct Message (DM) Transparency**: Fully fixes the DM tab side panel, friends list, and private conversation views so wallpapers display seamlessly without solid pitch-black overlays (`.homeWrapper__0920e`, `#app-mount .privateChannels`, and `.sidebar_c48ade` are 100% translucent).
- **High-Contrast Text Readability**: Enforces bright white typography (`--text-normal: #ffffff`) with subtle drop shadows (`text-shadow: 0 1px 2px rgba(0,0,0,0.7)`), guaranteeing message clarity over any background image.
- **Server Channels & Members Slider**: Smooth hover slide animation for member lists, translucent category headers, and animated voice chat speaking indicators.
- **Translucent Popouts & Profiles**: Glass modal windows and user profile cards with custom accent palettes.

### Available Themes:
- **New Kemono Friends Theme (`themes/NewKemonoFriends.theme.css`)**:
  - Warm Japari Park amber & rose palette (`#ff7b54` / `rgba(204, 102, 119, 0.6)`).
  - High-res Kemono Friends anime wallpaper with full DM panel transparency.
- **GGO Kirito Theme (`themes/GGOKirito.theme.css`)**:
  - Crimson sniper aesthetic with Kirito & Death Gun battle wallpaper (`red` / `rgba(100, 0, 0, 0.6)`).
  - High-res 2834×1464 background with zero external CDN dependencies.
- **Old Akame Ga Kill Theme (`themes/OldAkameGaKill.theme.css`)**:
  - Assassin crimson & shadow noir palette (`#e63946` / `rgba(150, 20, 30, 0.6)`).
  - High-res 1920×1080 Akame wallpaper with modernized visual refresh support.
- **New Akame Ga Kill! Theme (`themes/NewAkameGaKill.theme.css`)**:
  - Night Raid Murasame ruby & dark blood palette (`#c0122e` / `rgba(160, 0, 50, 0.6)`).
  - High-res 2000×1200 background asset with custom glass transparency.

### How to Install Themes:
- **Automatic**: Run `sudo ./setup.sh --themes` (or select Option `[3]` in the interactive menu). Deploys directly to Vencord (`~/.config/Vencord/themes/`).
- **Manual**: Copy any `.theme.css` file into your themes folder.
- In Discord, go to **User Settings** -> **Vencord** -> **Themes** and toggle on your desired theme. Press `Ctrl+R` to reload.

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
