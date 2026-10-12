import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags, EMPTY_AUDIO_METADATA } from "../src/discord/types";
import { buildVoiceMessagePayload, sendVoiceMessage } from "../src/discord/uploader";

test("Discord Protocol - Voice Message Flags & Payload Structure", async (t) => {
    await t.test("IS_VOICE_MESSAGE constant equals 8192 (1 << 13)", () => {
        assert.strictEqual(MessageFlags.IS_VOICE_MESSAGE, 8192);
        assert.strictEqual(1 << 13, 8192);
    });

    await t.test("constructs native voice message payload with required fields", () => {
        const metadata = {
            waveform: "AAAA////AAAA////",
            duration: 3.5,
            sampleRate: 48000,
            channels: 1,
            codec: "audio/ogg; codecs=opus"
        };

        const payload = buildVoiceMessagePayload("1234567890", "discord_cdn_temp_123.ogg", metadata, {
            nonce: "nonce_999"
        });

        assert.strictEqual(payload.flags, MessageFlags.IS_VOICE_MESSAGE);
        assert.strictEqual(payload.flags, 8192);
        assert.strictEqual(payload.channel_id, "1234567890");
        assert.strictEqual(payload.content, "");
        assert.strictEqual(payload.type, 0);
        assert.strictEqual(payload.nonce, "nonce_999");
        assert.strictEqual(payload.attachments.length, 1);

        const attachment = payload.attachments[0];
        assert.strictEqual(attachment.id, "0");
        assert.strictEqual(attachment.filename, "voice-message.ogg");
        assert.strictEqual(attachment.uploaded_filename, "discord_cdn_temp_123.ogg");
        assert.strictEqual(attachment.duration_secs, 3.5);
        assert.strictEqual(attachment.waveform, "AAAA////AAAA////");
    });

    await t.test("constructs normal audio attachment payload in fallback mode", () => {
        const metadata = {
            ...EMPTY_AUDIO_METADATA,
            duration: 2.0
        };

        const payload = buildVoiceMessagePayload("1234567890", "discord_cdn_temp_456.ogg", metadata, {
            asNormalAttachment: true
        });

        assert.strictEqual(payload.flags, 0);
        assert.strictEqual(payload.attachments.length, 1);
        const attachment = payload.attachments[0];
        assert.strictEqual(attachment.filename, "voice-message.ogg");
        assert.strictEqual(attachment.uploaded_filename, "discord_cdn_temp_456.ogg");
        assert.strictEqual(attachment.waveform, undefined);
        assert.strictEqual(attachment.duration_secs, undefined);
    });
});

test("Discord Protocol - Upload & Message Dispatch Flow", async (t) => {
    await t.test("executes CloudUpload and posts message via RestAPI", async () => {
        let uploadedFile: any = null;
        let restCallPayload: any = null;
        let progressCalled = false;
        let successCalled = false;

        class MockCloudUpload {
            public uploadedFilename = "server_uploaded_sample.ogg";
            private callbacks: Record<string, Function[]> = {};

            constructor(opts: any, _channelId: string) {
                uploadedFile = opts.file;
            }

            on(event: string, cb: Function) {
                this.callbacks[event] = this.callbacks[event] || [];
                this.callbacks[event].push(cb);
            }

            upload() {
                progressCalled = true;
                (this.callbacks["progress"] || []).forEach(cb => cb({ loaded: 100, total: 100 }));
                (this.callbacks["complete"] || []).forEach(cb => cb());
            }
        }

        const mockRestAPI = {
            post: async (options: { url: string; body: any }) => {
                restCallPayload = options;
                return { id: "msg_12345" };
            }
        };

        const mockGlobals = {
            CloudUpload: MockCloudUpload,
            RestAPI: mockRestAPI,
            Constants: {
                Endpoints: {
                    MESSAGES: (ch: string) => `/api/v9/channels/${ch}/messages`
                }
            },
            SnowflakeUtils: {
                fromTimestamp: () => "mock_snowflake_1"
            },
            showToast: (_msg: string) => {}
        };

        const blob = new Blob(["test-audio-data"], { type: "audio/ogg; codecs=opus" });
        const meta = { ...EMPTY_AUDIO_METADATA, duration: 4.5 };

        await sendVoiceMessage("chan_888", blob, meta, mockGlobals, {
            onProgress: () => { progressCalled = true; },
            onSuccess: () => { successCalled = true; }
        });

        assert.ok(uploadedFile);
        assert.strictEqual(uploadedFile.name, "voice-message.ogg");
        assert.ok(progressCalled);
        assert.ok(successCalled);
        assert.ok(restCallPayload);
        assert.strictEqual(restCallPayload.url, "/api/v9/channels/chan_888/messages");
        assert.strictEqual(restCallPayload.body.flags, 8192);
        assert.strictEqual(restCallPayload.body.attachments[0].duration_secs, 4.5);
    });

    await t.test("propagates upload error correctly", async () => {
        class FailingCloudUpload {
            private callbacks: Record<string, Function[]> = {};
            on(event: string, cb: Function) {
                this.callbacks[event] = this.callbacks[event] || [];
                this.callbacks[event].push(cb);
            }
            upload() {
                (this.callbacks["error"] || []).forEach(cb => cb(new Error("Network timeout")));
            }
        }

        const mockGlobals = {
            CloudUpload: FailingCloudUpload,
            RestAPI: { post: async () => {} },
            Constants: { Endpoints: { MESSAGES: (ch: string) => `/api/${ch}` } },
            showToast: () => {}
        };

        const blob = new Blob(["audio"]);
        let errorCaught = false;

        await assert.rejects(async () => {
            await sendVoiceMessage("chan_888", blob, EMPTY_AUDIO_METADATA, mockGlobals, {
                onError: () => { errorCaught = true; }
            });
        }, /upload failed/i);

        assert.strictEqual(errorCaught, true);
    });
});
