/**
 * Discord API and Voice Message Protocol Types
 * Specification Reference: https://docs.discord.com/developers/resources/message
 */

export const MessageFlags = {
    CROSSPOSTED: 1 << 0,
    IS_CROSSPOST: 1 << 1,
    SUPPRESS_EMBEDS: 1 << 2,
    SOURCE_MESSAGE_DELETED: 1 << 3,
    URGENT: 1 << 4,
    HAS_THREAD: 1 << 5,
    EPHEMERAL: 1 << 6,
    LOADING: 1 << 7,
    FAILED_TO_MENTION_SOME_ROLES_IN_THREAD: 1 << 8,
    SUPPRESS_NOTIFICATIONS: 1 << 12,
    IS_VOICE_MESSAGE: 1 << 13, // 8192
    HAS_SNAPSHOT: 1 << 14,
} as const;

export interface VoiceMessageAttachmentPayload {
    id: string;
    filename: string;
    uploaded_filename: string;
    waveform: string;
    duration_secs: number;
    description?: string;
}

export interface DiscordMessagePayload {
    flags: number;
    channel_id: string;
    content: string;
    nonce?: string;
    sticker_ids?: string[];
    type: number;
    attachments: VoiceMessageAttachmentPayload[];
    message_reference?: {
        message_id: string;
        channel_id?: string;
        guild_id?: string;
    } | null;
}

export interface AudioMetadata {
    waveform: string;
    duration: number;
    sampleRate?: number;
    channels?: number;
    codec?: string;
    fileSizeBytes?: number;
}

export const EMPTY_AUDIO_METADATA: AudioMetadata = {
    waveform: "AAAAAAAAAAAA",
    duration: 1.0,
    sampleRate: 48000,
    channels: 1,
    codec: "audio/ogg; codecs=opus"
};

export type RecordingState = "idle" | "requesting_permission" | "recording" | "paused" | "stopped" | "error";

export interface RecordingStatus {
    state: RecordingState;
    elapsedSeconds: number;
    errorMessage?: string;
    audioBlob?: Blob;
    metadata?: AudioMetadata;
}
