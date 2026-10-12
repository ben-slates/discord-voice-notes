import test from "node:test";
import assert from "node:assert/strict";
import { VoiceRecorderController } from "../src/audio/recorder";
import { RecordingStatus } from "../src/discord/types";

class MockMediaStreamTrack {
    public readyState = "live";
    public stopped = false;
    stop() {
        this.stopped = true;
        this.readyState = "ended";
    }
}

class MockMediaStream {
    private tracks: MockMediaStreamTrack[] = [new MockMediaStreamTrack()];
    getTracks() {
        return this.tracks;
    }
}

class MockMediaRecorder {
    public state: "inactive" | "recording" | "paused" = "inactive";
    public mimeType: string;
    public stream: MockMediaStream;
    public ondataavailable: ((e: any) => void) | null = null;
    public onstop: (() => void) | null = null;
    public onerror: ((e: any) => void) | null = null;

    static supportedTypes = ["audio/ogg; codecs=opus", "audio/webm; codecs=opus", "audio/webm"];

    static isTypeSupported(type: string) {
        return MockMediaRecorder.supportedTypes.includes(type);
    }

    constructor(stream: MockMediaStream, options: { mimeType?: string } = {}) {
        this.stream = stream;
        this.mimeType = options.mimeType || "audio/ogg; codecs=opus";
    }

    start(_timeslice?: number) {
        this.state = "recording";
    }

    pause() {
        this.state = "paused";
    }

    resume() {
        this.state = "recording";
    }

    stop() {
        this.state = "inactive";
        if (this.ondataavailable) {
            const mockChunk = new Blob(["mock-ogg-opus-audio-data"], { type: this.mimeType });
            this.ondataavailable({ data: mockChunk });
        }
        if (this.onstop) {
            this.onstop();
        }
    }
}

test("VoiceRecorderController - Environment Detection & Format Support", async (t) => {
    await t.test("reports supported mime type when MediaRecorder is present", () => {
        (global as any).MediaRecorder = MockMediaRecorder;
        const supported = VoiceRecorderController.getSupportedMimeType();
        assert.strictEqual(supported, "audio/ogg; codecs=opus");
        delete (global as any).MediaRecorder;
    });

    await t.test("gracefully falls back when MediaRecorder is absent", () => {
        const supported = VoiceRecorderController.getSupportedMimeType();
        assert.strictEqual(supported, "audio/ogg; codecs=opus");
    });
});

test("VoiceRecorderController - State Machine & Lifecycle Transitions", async (t) => {
    const originalNavigator = (global as any).navigator;
    const originalMediaRecorder = (global as any).MediaRecorder;
    const originalWindow = (global as any).window;

    const mockTrack = new MockMediaStreamTrack();
    const mockStream = {
        getTracks: () => [mockTrack]
    };

    (global as any).MediaStream = MockMediaStream;
    (global as any).MediaRecorder = MockMediaRecorder;
    (global as any).window = {};
    (global as any).navigator = {
        mediaDevices: {
            getUserMedia: async () => mockStream
        }
    };

    await t.test("transitions through idle -> requesting -> recording -> paused -> stopped", async () => {
        const stateHistory: string[] = [];
        const controller = new VoiceRecorderController({
            onStatusChange: (status: RecordingStatus) => {
                stateHistory.push(status.state);
            }
        });

        assert.strictEqual(controller.getState(), "idle");

        await controller.start();
        assert.strictEqual(controller.getState(), "recording");

        controller.pause();
        assert.strictEqual(controller.getState(), "paused");

        controller.resume();
        assert.strictEqual(controller.getState(), "recording");

        const result = await controller.stop();
        assert.strictEqual(controller.getState(), "stopped");
        assert.ok(result.blob);
        assert.ok(result.metadata);
        assert.ok(result.metadata.waveform);

        assert.ok(stateHistory.includes("requesting_permission"));
        assert.ok(stateHistory.includes("recording"));
        assert.ok(stateHistory.includes("paused"));
        assert.ok(stateHistory.includes("stopped"));
    });

    await t.test("cancel cleans up tracks, stops timers, and resets to idle", async () => {
        let lastStatus: any = null;
        const controller = new VoiceRecorderController({
            onStatusChange: (status) => {
                lastStatus = status;
            }
        });

        await controller.start();
        assert.strictEqual(controller.getState(), "recording");

        controller.cancel();
        assert.strictEqual(controller.getState(), "idle");
        assert.strictEqual(controller.getElapsedSeconds(), 0);
        assert.strictEqual(lastStatus?.state, "idle");
        assert.strictEqual(mockTrack.stopped, true);
    });

    (global as any).navigator = originalNavigator;
    (global as any).MediaRecorder = originalMediaRecorder;
    (global as any).window = originalWindow;
});

test("VoiceRecorderController - Error & Permission Handling", async (t) => {
    const originalNavigator = (global as any).navigator;

    await t.test("handles NotAllowedError (permission denied) gracefully with user-friendly message", async () => {
        (global as any).navigator = {
            mediaDevices: {
                getUserMedia: async () => {
                    const err = new Error("Permission denied");
                    err.name = "NotAllowedError";
                    throw err;
                }
            }
        };

        let capturedError: string | undefined;
        const controller = new VoiceRecorderController({
            onStatusChange: (status) => {
                if (status.errorMessage) capturedError = status.errorMessage;
            }
        });

        await assert.rejects(async () => {
            await controller.start();
        }, /Microphone access denied/);

        assert.strictEqual(controller.getState(), "error");
        assert.ok(capturedError?.includes("Microphone access denied"));
    });

    await t.test("handles NotFoundError (no audio device) gracefully", async () => {
        (global as any).navigator = {
            mediaDevices: {
                getUserMedia: async () => {
                    const err = new Error("Devices not found");
                    err.name = "NotFoundError";
                    throw err;
                }
            }
        };

        const controller = new VoiceRecorderController();
        await assert.rejects(async () => {
            await controller.start();
        }, /No microphone device found/);

        assert.strictEqual(controller.getState(), "error");
    });

    await t.test("handles missing navigator.mediaDevices in non-browser environments", async () => {
        delete (global as any).navigator;
        const controller = new VoiceRecorderController();

        await assert.rejects(async () => {
            await controller.start();
        }, /Audio recording is not supported in this environment/);

        assert.strictEqual(controller.getState(), "error");
    });

    (global as any).navigator = originalNavigator;
});
