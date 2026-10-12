/**
 * Waveform generation and encoding utilities for Discord Voice Messages.
 */

import { AudioMetadata, EMPTY_AUDIO_METADATA } from "../discord/types";

export function encodeWaveformBase64(bytes: Uint8Array): string {
    if (!bytes || bytes.length === 0) {
        return EMPTY_AUDIO_METADATA.waveform;
    }

    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64");
    }

    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function decodeWaveformBase64(base64: string): Uint8Array {
    if (!base64 || typeof base64 !== "string") {
        return new Uint8Array(0);
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        return new Uint8Array(0);
    }

    try {
        if (typeof Buffer !== "undefined") {
            const buf = Buffer.from(base64, "base64");
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
        }

        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return new Uint8Array(0);
    }
}

export function isValidWaveform(base64Str: string): boolean {
    if (!base64Str || typeof base64Str !== "string" || base64Str.trim() === "") {
        return false;
    }

    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (!base64Regex.test(base64Str)) {
        return false;
    }

    const decoded = decodeWaveformBase64(base64Str);
    return decoded.length >= 1 && decoded.length <= 256;
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function calculateBinCount(durationSecs: number, totalSamples: number): number {
    if (totalSamples <= 0) return 0;
    const desired = Math.floor(durationSecs * 10);
    const minBins = Math.min(32, totalSamples);
    return clamp(desired, minBins, 256);
}

export function generateWaveformFromSamples(
    channelData: Float32Array,
    sampleRate = 48000
): AudioMetadata {
    if (!channelData || channelData.length === 0 || sampleRate <= 0) {
        return { ...EMPTY_AUDIO_METADATA };
    }

    const duration = channelData.length / sampleRate;
    const binCount = calculateBinCount(duration, channelData.length);
    if (binCount === 0) {
        return { ...EMPTY_AUDIO_METADATA, duration };
    }

    const bins = new Uint8Array(binCount);
    const samplesPerBin = Math.max(1, Math.floor(channelData.length / binCount));

    for (let binIdx = 0; binIdx < binCount; binIdx++) {
        let sumSquares = 0;
        const start = binIdx * samplesPerBin;
        const end = Math.min(start + samplesPerBin, channelData.length);
        const count = end - start;

        if (count > 0) {
            for (let i = start; i < end; i++) {
                const sample = channelData[i];
                sumSquares += sample * sample;
            }
            const rms = Math.sqrt(sumSquares / count);
            bins[binIdx] = Math.min(0xFF, Math.floor(rms * 0xFF));
        } else {
            bins[binIdx] = 0;
        }
    }

    let maxBin = 0;
    for (let i = 0; i < bins.length; i++) {
        if (bins[i] > maxBin) maxBin = bins[i];
    }

    if (maxBin > 0) {
        const ratio = 1 + (0xFF / maxBin - 1) * Math.min(1, 100 * (maxBin / 0xFF) ** 3);
        for (let i = 0; i < bins.length; i++) {
            bins[i] = Math.min(0xFF, Math.floor(bins[i] * ratio));
        }
    }

    return {
        waveform: encodeWaveformBase64(bins),
        duration: Math.round(duration * 100) / 100,
        sampleRate,
        channels: 1,
        codec: "audio/ogg; codecs=opus"
    };
}
