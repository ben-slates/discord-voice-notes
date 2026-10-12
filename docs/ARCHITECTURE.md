# Architecture & Design Specification

## Overview

**Discord Voice Notes for Debian Linux** is an open-source add-on for the official Discord desktop client on Linux (specifically Debian 12 Bookworm, Debian 13 Trixie, and Debian-derived systems like Kali Linux). It enables recording and sending native voice messages directly from the chat interface without external dependencies or cloud proxies.

## High-Level Architecture

```
+--------------------------------------------------------------------------+
|                        Discord Electron Desktop Client                   |
|                                                                          |
|  +-----------------------+           +--------------------------------+  |
|  | Discord ChatBar UI    |           | Discord Voice Notes Plugin     |  |
|  | - Message Composer    | <-------> | - Toolbar Microphone Button    |  |
|  | - Upload Attachment   |           | - Recording Panel Overlay      |  |
|  +-----------------------+           | - Waveform & Timer Controls    |  |
|                                      +--------------------------------+  |
|                                                     |                    |
|                                                     v                    |
|                                      +--------------------------------+  |
|                                      | VoiceRecorderController        |  |
|                                      | - Web Audio API (AnalyserNode) |  |
|                                      | - MediaRecorder (audio/ogg)    |  |
|                                      +--------------------------------+  |
|                                                     |                    |
|                                                     v                    |
|                                      +--------------------------------+  |
|                                      | Audio & Waveform Pipeline      |  |
|                                      | - AudioContext RMS computation |  |
|                                      | - Base64 Byte Array Encoding   |  |
|                                      +--------------------------------+  |
|                                                     |                    |
|                                                     v                    |
|                                      +--------------------------------+  |
|                                      | Discord Native Dispatcher      |  |
|                                      | - CloudUpload Pipeline         |  |
|                                      | - Flag 8192 (IS_VOICE_MESSAGE) |  |
|                                      | - Fallback Attachment Mode     |  |
|                                      +--------------------------------+  |
+--------------------------------------------------------------------------+
                                      |
                                      v
                       +-----------------------------+
                       | Linux Audio Subsystem       |
                       | PipeWire / PulseAudio / ALSA|
                       +-----------------------------+
```

## Component Breakdown

### 1. Audio Engine (`src/audio/recorder.ts` & `src/audio/waveform.ts`)
- **Web Audio API**: Uses `AudioContext` and `AnalyserNode` with `fftSize = 256` for real-time visualization and RMS volume metering.
- **MediaRecorder**: Employs browser-native `MediaRecorder` targeting `audio/ogg; codecs=opus` (or `audio/webm; codecs=opus`) at 64 kbps, conforming with Discord's voice message specifications.
- **Waveform Serialization**:
  - Discord requires a Base64-encoded byte array representing the audio amplitude across time.
  - The duration is sliced into $\le 256$ bins (~10 bins per second).
  - Normalization applies dynamic range expansion:
    $$\text{normalized} = \left(\frac{\text{rms}}{\text{maxRms}}\right)^{0.6} \times 255$$
  - Clamped to $[0, 255]$ and encoded as standard Base64.

### 2. Discord Dispatcher (`src/discord/uploader.ts` & `src/discord/types.ts`)
- **Flags**: `MessageFlags.IS_VOICE_MESSAGE = 8192` (`1 << 13`).
- **Attachments**: Single audio attachment (`voice-message.ogg`).
  - `duration_secs`: Float duration of the clip.
  - `waveform`: Base64 string computed from audio samples.
- **Upload Flow**: Integrates directly with Discord's internal `CloudUpload` module (found via webpack search) to upload the audio asset, followed by standard message transmission (`SendMessageStore.sendMessage` or `RestAPI.post`).
- **Graceful Fallback**: If the Discord server or channel does not permit voice messages, or if the user unchecks native voice notes, it transparently sends as a regular audio attachment.

### 3. User Interface (`src/components/VoicePanel.tsx` & `src/plugin/VoiceBarButton.tsx`)
- Appends an intuitive microphone button directly adjacent to the ChatBar composer.
- Floating modal / overlay with elapsed time counter, live amplitude animation, stop/cancel actions, preview playback, and send button.
- Native Discord dark/light theme integration via standard CSS variables.

### 4. Client Modification Layer (`src/plugin/index.ts`)
- Implements standard Vencord plugin lifecycle: `start()`, `stop()`, and patch interceptors.
- Bundles cleanly as both ESM (`index.js`) and CommonJS (`index.cjs`).
