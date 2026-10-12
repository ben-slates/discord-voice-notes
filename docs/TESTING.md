# Testing & Verification Guide

## Automated Test Suite

The project includes unit tests covering:
1. **Waveform Calculation & Serialization** (`tests/waveform.test.ts`):
   - Non-linear RMS compression
   - Bin count clamping ($\le 256$ bins)
   - Base64 encoding/decoding integrity
   - Zero-length and high-frequency edge cases
2. **Recording State Machine** (`tests/recording.test.ts`):
   - State progression (`idle` -> `requesting` -> `recording` -> `paused` -> `stopped`)
   - Cancellation and track disposal
   - Error mapping (`NotAllowedError`, `NotFoundError`, etc.)
3. **Discord Protocol & Upload** (`tests/protocol.test.ts`):
   - Flag validation (`IS_VOICE_MESSAGE = 8192`)
   - Payload formatting with `duration_secs` and `waveform`
   - Attachment fallback payload generation
   - Upload error handling

## Running Tests

```bash
# Run all tests
npm test

# Run tests via Makefile
make test

# Run tests with coverage or watch
npx tsx --test tests/waveform.test.ts
```
