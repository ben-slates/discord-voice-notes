/**
 * Audio Recording Controller for Discord Voice Notes.
 */

import { AudioMetadata, RecordingState, RecordingStatus } from "../discord/types";
import { generateWaveformFromSamples } from "./waveform";

export interface RecorderOptions {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
    deviceId?: string;
    preferredMimeType?: string;
    onStatusChange?: (status: RecordingStatus) => void;
}

export class VoiceRecorderController {
    private state: RecordingState = "idle";
    private mediaStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private timerInterval: ReturnType<typeof setInterval> | null = null;
    private elapsedSeconds = 0;
    private startTime = 0;
    private options: RecorderOptions;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;

    constructor(options: RecorderOptions = {}) {
        this.options = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...options
        };
    }

    public getState(): RecordingState {
        return this.state;
    }

    public getElapsedSeconds(): number {
        return this.elapsedSeconds;
    }

    private updateStatus(errorMessage?: string, audioBlob?: Blob, metadata?: AudioMetadata) {
        if (this.options.onStatusChange) {
            this.options.onStatusChange({
                state: this.state,
                elapsedSeconds: this.elapsedSeconds,
                errorMessage,
                audioBlob,
                metadata
            });
        }
    }

    public static getSupportedMimeType(): string {
        if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
            return "audio/ogg; codecs=opus";
        }

        const candidateTypes = [
            "audio/ogg; codecs=opus",
            "audio/ogg",
            "audio/webm; codecs=opus",
            "audio/webm"
        ];

        for (const type of candidateTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return "";
    }

    public async start(): Promise<void> {
        if (this.state === "recording") {
            return;
        }

        this.cleanup();
        this.state = "requesting_permission";
        this.updateStatus();

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            this.state = "error";
            const err = "Audio recording is not supported in this environment (missing navigator.mediaDevices)";
            this.updateStatus(err);
            throw new Error(err);
        }

        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: this.options.echoCancellation,
                    noiseSuppression: this.options.noiseSuppression,
                    autoGainControl: this.options.autoGainControl,
                    deviceId: this.options.deviceId ? { exact: this.options.deviceId } : undefined
                },
                video: false
            };

            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            const mimeType = this.options.preferredMimeType || VoiceRecorderController.getSupportedMimeType();

            const recorderOptions: MediaRecorderOptions = {};
            if (mimeType) {
                recorderOptions.mimeType = mimeType;
            }

            this.mediaRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
            this.recordedChunks = [];

            try {
                const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                if (AudioContextClass) {
                    this.audioContext = new AudioContextClass();
                    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
                    this.analyser = this.audioContext.createAnalyser();
                    this.analyser.fftSize = 256;
                    source.connect(this.analyser);
                }
            } catch {
                // AudioContext fallback
            }

            this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onerror = (event: Event) => {
                this.state = "error";
                const err = (event as unknown as { error?: Error }).error?.message || "MediaRecorder error";
                this.cleanup();
                this.updateStatus(err);
            };

            this.mediaRecorder.start(100);
            this.startTime = Date.now();
            this.elapsedSeconds = 0;
            this.state = "recording";

            this.startTimer();
            this.updateStatus();
        } catch (error: unknown) {
            this.cleanup();
            this.state = "error";
            const errName = (error as { name?: string })?.name;
            let friendlyMessage = "Failed to access microphone.";

            if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
                friendlyMessage = "Microphone access denied. Please grant microphone permissions in Discord / Linux.";
            } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
                friendlyMessage = "No microphone device found on this system.";
            } else if (errName === "NotReadableError" || errName === "TrackStartError") {
                friendlyMessage = "Microphone is in use by another application or unavailable.";
            } else if (error instanceof Error) {
                friendlyMessage = error.message;
            }

            this.updateStatus(friendlyMessage);
            throw new Error(friendlyMessage);
        }
    }

    public pause(): void {
        if (this.state !== "recording" || !this.mediaRecorder) {
            return;
        }

        if (this.mediaRecorder.state === "recording") {
            this.mediaRecorder.pause();
        }
        this.stopTimer();
        this.state = "paused";
        this.updateStatus();
    }

    public resume(): void {
        if (this.state !== "paused" || !this.mediaRecorder) {
            return;
        }

        if (this.mediaRecorder.state === "paused") {
            this.mediaRecorder.resume();
        }
        this.startTimer();
        this.state = "recording";
        this.updateStatus();
    }

    public async stop(): Promise<{ blob: Blob; metadata: AudioMetadata }> {
        if (this.state !== "recording" && this.state !== "paused") {
            throw new Error(`Cannot stop recording when in '${this.state}' state`);
        }

        this.stopTimer();

        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder) {
                this.cleanup();
                this.state = "idle";
                return reject(new Error("No active MediaRecorder"));
            }

            this.mediaRecorder.onstop = async () => {
                try {
                    const finalMime = this.mediaRecorder?.mimeType || "audio/ogg; codecs=opus";
                    const blob = new Blob(this.recordedChunks, { type: finalMime });

                    let metadata: AudioMetadata;
                    try {
                        const arrayBuf = await blob.arrayBuffer();
                        if (this.audioContext && this.audioContext.state !== "closed") {
                            const decoded = await this.audioContext.decodeAudioData(arrayBuf.slice(0));
                            const channelData = decoded.getChannelData(0);
                            metadata = generateWaveformFromSamples(channelData, decoded.sampleRate);
                        } else {
                            metadata = {
                                waveform: "AAAAAAAAAAAA",
                                duration: Math.max(0.1, Math.round(this.elapsedSeconds * 100) / 100),
                                sampleRate: 48000,
                                channels: 1,
                                codec: finalMime
                            };
                        }
                    } catch {
                        metadata = {
                            waveform: "AAAAAAAAAAAA",
                            duration: Math.max(0.1, Math.round(this.elapsedSeconds * 100) / 100),
                            sampleRate: 48000,
                            channels: 1,
                            codec: finalMime
                        };
                    }

                    this.state = "stopped";
                    this.updateStatus(undefined, blob, metadata);
                    this.cleanup();
                    resolve({ blob, metadata });
                } catch (e) {
                    this.cleanup();
                    this.state = "error";
                    const msg = e instanceof Error ? e.message : "Failed to finalize recording";
                    this.updateStatus(msg);
                    reject(e);
                }
            };

            this.mediaRecorder.stop();
        });
    }

    public cancel(): void {
        this.cleanup();
        this.state = "idle";
        this.recordedChunks = [];
        this.elapsedSeconds = 0;
        this.updateStatus();
    }

    public getLiveAudioData(outputArray: Uint8Array): void {
        if (this.analyser && this.state === "recording") {
            (this.analyser as any).getByteFrequencyData(outputArray);
        } else {
            outputArray.fill(0);
        }
    }

    private startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            this.elapsedSeconds = Math.round((Date.now() - this.startTime) / 1000);
            this.updateStatus();
        }, 200);
    }

    private stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    public cleanup(): void {
        this.stopTimer();

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch {
                    // Ignore track error
                }
            });
            this.mediaStream = null;
        }

        if (this.audioContext && this.audioContext.state !== "closed") {
            try {
                this.audioContext.close();
            } catch {
                // Ignore close error
            }
            this.audioContext = null;
        }

        this.analyser = null;
        this.mediaRecorder = null;
    }
}
