/**
 * Types and schema for the DM Archive Vencord custom plugin.
 */

export interface ArchiveAuthor {
    id: string;
    username: string;
    globalName?: string;
    discriminator?: string;
    avatarUrl?: string;
    bot?: boolean;
}

export interface ArchiveAttachment {
    id: string;
    filename: string;
    size: number;
    url: string;
    contentType?: string;
    proxyUrl?: string;
    width?: number;
    height?: number;
}

export interface ArchiveEmbed {
    type?: string;
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    thumbnailUrl?: string;
    imageUrl?: string;
}

export interface ArchiveMessage {
    id: string;
    channelId: string;
    content: string;
    author: ArchiveAuthor;
    timestamp: string; // ISO 8601
    editedTimestamp: string | null;
    attachments: ArchiveAttachment[];
    embeds: ArchiveEmbed[];
    isReply?: boolean;
    replyToId?: string;
}

export interface ArchiveFilterOptions {
    startDate?: string | null; // ISO date string YYYY-MM-DD
    endDate?: string | null;   // ISO date string YYYY-MM-DD
    includeAttachments: boolean;
    format: "html" | "json" | "both";
    customFilename?: string;
}

export interface ArchiveChannelInfo {
    id: string;
    name: string;
    type: "DM" | "GROUP_DM";
    recipients: ArchiveAuthor[];
}

export interface ArchiveMetadata {
    version: "1.0.0";
    exportedAt: string;
    isComplete: boolean;
    status: "complete" | "partial" | "cancelled" | "error";
    statusMessage?: string;
    channel: ArchiveChannelInfo;
    filter: {
        startDate: string | null;
        endDate: string | null;
        includeAttachments: boolean;
    };
    totalMessages: number;
}

export interface ArchivePayload {
    metadata: ArchiveMetadata;
    messages: ArchiveMessage[];
}

export interface FetchProgress {
    fetchedCount: number;
    batchNumber: number;
    isRateLimited: boolean;
    rateLimitRemainingMs?: number;
    isComplete: boolean;
    error?: string;
}
