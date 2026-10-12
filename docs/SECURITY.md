# Security & Privacy Policy

## Core Security Tenets

1. **No Token Interception or Credential Storage**:
   Discord Voice Notes **never** extracts, inspects, stores, or transmits user authentication tokens, passwords, or credentials.
2. **Local Processing**:
   All audio recording, waveform generation, and encoding take place exclusively on the client's local system. No third-party servers or external telemetry endpoints are used.
3. **Native Upload Pipeline**:
   File uploads rely directly on Discord's own existing internal dispatch pipelines (`CloudUpload`), upholding Discord's standard TLS encryption and channel permissions.
4. **Clean Reversibility**:
   The plugin does not patch or corrupt system libraries. It can be disabled or uninstalled with a single command (`discord-voice-notes --restore` or `discord-voice-notes --uninstall`).
