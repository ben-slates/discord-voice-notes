/**
 * Discord Voice Message Upload and Message Dispatcher
 */

import { AudioMetadata, MessageFlags, DiscordMessagePayload } from "./types";

export interface UploadOptions {
    asNormalAttachment?: boolean;
    replyMessageReference?: any;
    onProgress?: (percent: number) => void;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}

export interface DiscordWebpackGlobals {
    CloudUpload?: any;
    RestAPI?: {
        post: (options: { url: string; body: any }) => Promise<any>;
    };
    Constants?: {
        Endpoints: {
            MESSAGES: (channelId: string) => string;
        };
    };
    SnowflakeUtils?: {
        fromTimestamp: (ts: number) => string;
    };
    showToast?: (message: string, type?: string) => void;
}

export function buildVoiceMessagePayload(
    channelId: string,
    uploadedFilename: string,
    metadata: AudioMetadata,
    options: {
        nonce?: string;
        filename?: string;
        asNormalAttachment?: boolean;
        messageReference?: any;
    } = {}
): DiscordMessagePayload {
    const filename = options.filename || "voice-message.ogg";
    const nonce = options.nonce || String(Date.now());
    const flags = options.asNormalAttachment ? 0 : MessageFlags.IS_VOICE_MESSAGE;

    const attachmentObj: any = {
        id: "0",
        filename,
        uploaded_filename: uploadedFilename
    };

    if (!options.asNormalAttachment) {
        attachmentObj.waveform = metadata.waveform;
        attachmentObj.duration_secs = metadata.duration;
    }

    return {
        flags,
        channel_id: channelId,
        content: "",
        nonce,
        sticker_ids: [],
        type: 0,
        attachments: [attachmentObj],
        message_reference: options.messageReference || null
    };
}

export async function sendVoiceMessage(
    channelId: string,
    audioBlob: Blob,
    metadata: AudioMetadata,
    discordModules: DiscordWebpackGlobals,
    options: UploadOptions = {}
): Promise<void> {
    const { CloudUpload, RestAPI, Constants, SnowflakeUtils, showToast } = discordModules;

    if (!CloudUpload || !RestAPI || !Constants?.Endpoints) {
        const error = new Error("Discord upload modules not found. Ensure Discord is fully initialized.");
        if (showToast) showToast(error.message, "failure");
        options.onError?.(error);
        throw error;
    }

    const filename = "voice-message.ogg";
    const file = new File([audioBlob], filename, { type: audioBlob.type || "audio/ogg; codecs=opus" });

    return new Promise((resolve, reject) => {
        try {
            const upload = new CloudUpload(
                {
                    file,
                    isThumbnail: false,
                    platform: 1
                },
                channelId
            );

            if (options.onProgress && typeof upload.on === "function") {
                upload.on("progress", (progress: { loaded: number; total: number }) => {
                    if (progress.total > 0) {
                        options.onProgress?.(Math.round((progress.loaded / progress.total) * 100));
                    }
                });
            }

            upload.on("complete", async () => {
                try {
                    const nonce = SnowflakeUtils?.fromTimestamp
                        ? SnowflakeUtils.fromTimestamp(Date.now())
                        : String(Date.now());

                    const payload = buildVoiceMessagePayload(
                        channelId,
                        upload.uploadedFilename,
                        metadata,
                        {
                            nonce,
                            filename,
                            asNormalAttachment: options.asNormalAttachment,
                            messageReference: options.replyMessageReference
                        }
                    );

                    await RestAPI.post({
                        url: Constants.Endpoints.MESSAGES(channelId),
                        body: payload
                    });

                    if (showToast) {
                        showToast(
                            options.asNormalAttachment
                                ? "Audio attachment sent!"
                                : "Voice message sent!",
                            "success"
                        );
                    }

                    options.onSuccess?.();
                    resolve();
                } catch (sendError: unknown) {
                    const err = sendError instanceof Error ? sendError : new Error(String(sendError));
                    if (showToast) {
                        showToast(`Failed to send message: ${err.message}`, "failure");
                    }
                    options.onError?.(err);
                    reject(err);
                }
            });

            upload.on("error", (uploadError: unknown) => {
                const innerMsg = uploadError instanceof Error ? uploadError.message : "Failed to upload audio to Discord CDN";
                const err = new Error(`Voice message upload failed: ${innerMsg}`);
                if (showToast) {
                    showToast(err.message, "failure");
                }
                options.onError?.(err);
                reject(err);
            });

            upload.upload();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (showToast) showToast(err.message, "failure");
            options.onError?.(err);
            reject(err);
        }
    });
}
