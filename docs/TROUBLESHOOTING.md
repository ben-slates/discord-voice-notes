# Troubleshooting & FAQ

## Common Issues & Solutions

### 1. "Permission Denied" when accessing microphone in Discord
**Cause**: The Discord Electron application does not have access to the audio recording device.
**Remedy**:
1. Run `discord-voice-notes --doctor` to check system audio servers.
2. In Discord, go to **User Settings > Voice & Video**.
3. Ensure the correct **Input Device** is selected and test the microphone.
4. If running in a sandbox or Flatpak, verify audio socket permissions (PipeWire or PulseAudio socket access).

### 2. "Discord app.asar not found" during doctor check
**Cause**: Discord is installed in a non-standard location or via Flatpak/Snap.
**Remedy**:
- If using official Debian package, Discord is located at `/opt/discord` or `/usr/share/discord`.
- If installed manually or under a custom path, symlink it to `/opt/discord`:
  ```bash
  sudo ln -s /path/to/discord /opt/discord
  ```

### 3. Voice message sends as a regular attachment instead of voice bubble
**Cause**:
- The Discord guild/channel does not support voice messages (e.g. permission restriction).
- The user unchecked the "Send as native Discord voice message" toggle.
- Discord server rejected flag 8192 for that channel, triggering automatic fallback.

### 4. How to undo all changes and restore vanilla Discord
Run the built-in restore tool:
```bash
discord-voice-notes --restore
```
This safely removes the client modification hooks and returns Discord to its unmodified state.
