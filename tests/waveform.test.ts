import test from "node:test";
import assert from "node:assert/strict";
import {
    encodeWaveformBase64,
    decodeWaveformBase64,
    isValidWaveform,
    calculateBinCount,
    generateWaveformFromSamples
} from "../src/audio/waveform";
import { EMPTY_AUDIO_METADATA } from "../src/discord/types";

test("Waveform Utilities - Base64 Encoding and Decoding", async (t) => {
    await t.test("encodes and decodes an arbitrary byte array round-trip", () => {
        const input = new Uint8Array([0, 10, 50, 128, 200, 255]);
        const base64 = encodeWaveformBase64(input);
        assert.ok(typeof base64 === "string");
        assert.ok(base64.length > 0);

        const decoded = decodeWaveformBase64(base64);
        assert.strictEqual(decoded.length, input.length);
        for (let i = 0; i < input.length; i++) {
            assert.strictEqual(decoded[i], input[i]);
        }
    });

    await t.test("handles empty byte arrays gracefully", () => {
        const empty = new Uint8Array(0);
        const base64 = encodeWaveformBase64(empty);
        assert.strictEqual(base64, EMPTY_AUDIO_METADATA.waveform);

        const decoded = decodeWaveformBase64("");
        assert.strictEqual(decoded.length, 0);
    });

    await t.test("decodes corrupt or invalid base64 gracefully without throwing", () => {
        const decoded = decodeWaveformBase64("!!!not-valid-base64&&&");
        assert.strictEqual(decoded.length, 0);
    });
});

test("Waveform Utilities - Validation", async (t) => {
    await t.test("validates properly formatted base64 waveforms within 256 bytes", () => {
        const sampleBins = new Uint8Array(64).fill(128);
        const encoded = encodeWaveformBase64(sampleBins);
        assert.strictEqual(isValidWaveform(encoded), true);
    });

    await t.test("rejects waveforms exceeding Discord 256 datapoint limit", () => {
        const oversized = new Uint8Array(257).fill(100);
        const encoded = encodeWaveformBase64(oversized);
        assert.strictEqual(isValidWaveform(encoded), false);
    });

    await t.test("rejects invalid or empty string inputs", () => {
        assert.strictEqual(isValidWaveform(""), false);
        assert.strictEqual(isValidWaveform("   "), false);
        assert.strictEqual(isValidWaveform(null as unknown as string), false);
        assert.strictEqual(isValidWaveform("not@valid"), false);
    });
});

test("Waveform Utilities - Bin Count Calculation", async (t) => {
    await t.test("calculates bins at ~10 bins per second clamped between 32 and 256", () => {
        assert.strictEqual(calculateBinCount(1.0, 48000), 32);
        assert.strictEqual(calculateBinCount(10.0, 480000), 100);
        assert.strictEqual(calculateBinCount(30.0, 1440000), 256);
        assert.strictEqual(calculateBinCount(120.0, 5760000), 256);
        assert.strictEqual(calculateBinCount(0, 0), 0);
    });
});

test("Waveform Utilities - Waveform Generation from Audio Samples", async (t) => {
    await t.test("generates waveform and duration from synthetic sine wave samples", () => {
        const sampleRate = 48000;
        const durationSecs = 2.0;
        const totalSamples = Math.floor(sampleRate * durationSecs);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.8;
        }

        const result = generateWaveformFromSamples(samples, sampleRate);
        assert.ok(result.waveform);
        assert.strictEqual(result.duration, 2.0);
        assert.strictEqual(result.sampleRate, sampleRate);
        assert.strictEqual(result.channels, 1);

        const decoded = decodeWaveformBase64(result.waveform);
        assert.strictEqual(decoded.length, 32);

        for (let i = 0; i < decoded.length; i++) {
            assert.ok(decoded[i] > 100);
            assert.ok(decoded[i] <= 255);
        }
    });

    await t.test("generates normalized waveform for silence without crashing", () => {
        const samples = new Float32Array(48000);
        const result = generateWaveformFromSamples(samples, 48000);

        assert.ok(result.waveform);
        assert.strictEqual(result.duration, 1.0);
        const decoded = decodeWaveformBase64(result.waveform);
        assert.strictEqual(decoded.length, 32);

        for (let i = 0; i < decoded.length; i++) {
            assert.strictEqual(decoded[i], 0);
        }
    });

    await t.test("handles empty samples gracefully", () => {
        const result = generateWaveformFromSamples(new Float32Array(0), 48000);
        assert.strictEqual(result.waveform, EMPTY_AUDIO_METADATA.waveform);
        assert.strictEqual(result.duration, 1.0);
    });

    await t.test("handles long audio (60 seconds) by clamping to 256 bins", () => {
        const sampleRate = 48000;
        const totalSamples = sampleRate * 60;
        const samples = new Float32Array(totalSamples);
        for (let i = 0; i < totalSamples / 2; i++) {
            samples[i] = (Math.random() - 0.5) * 0.5;
        }

        const result = generateWaveformFromSamples(samples, sampleRate);
        assert.strictEqual(result.duration, 60);

        const decoded = decodeWaveformBase64(result.waveform);
        assert.strictEqual(decoded.length, 256);
    });
});
