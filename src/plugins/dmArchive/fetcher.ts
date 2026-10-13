/**
 * Message history pagination and retrieval logic for DM Archive.
 */

import { ArchiveFilterOptions, ArchiveMessage, ArchiveAuthor, ArchiveAttachment, ArchiveEmbed, FetchProgress } from "./types";

export interface MessageFetcherConfig {
    channelId: string;
    restClient: {
        get: (req: { url: string; query?: Record<string, any>; retries?: number }) => Promise<{ body: any; status?: number }>;
    };
    endpoints: {
        MESSAGES: (channelId: string) => string;
    };
    filter?: ArchiveFilterOptions;
    onProgress?: (progress: FetchProgress) => void;
    shouldCancel?: () => boolean;
    batchDelayMs?: number;
}

export function buildAvatarUrl(authorId: string, avatarHash?: string | null): string {
    if (avatarHash) {
        return `https://cdn.discordapp.com/avatars/${authorId}/${avatarHash}.png?size=64`;
    }
    // Default Discord avatar based on user ID mod 6
    try {
        const index = (BigInt(authorId) >> 22n) % 6n;
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
}

export function parseRawMessage(raw: any, includeAttachments: boolean = true): ArchiveMessage {
    const author: ArchiveAuthor = {
        id: String(raw.author?.id || "0"),
        username: String(raw.author?.username || "Unknown"),
        globalName: raw.author?.global_name || undefined,
        discriminator: raw.author?.discriminator || undefined,
        avatarUrl: buildAvatarUrl(String(raw.author?.id || "0"), raw.author?.avatar),
        bot: Boolean(raw.author?.bot)
    };

    const attachments: ArchiveAttachment[] = includeAttachments && Array.isArray(raw.attachments)
        ? raw.attachments.map((att: any) => ({
            id: String(att.id),
            filename: String(att.filename || "file"),
            size: Number(att.size || 0),
            url: String(att.url || att.proxy_url || ""),
            contentType: att.content_type,
            proxyUrl: att.proxy_url,
            width: att.width,
            height: att.height
        }))
        : [];

    const embeds: ArchiveEmbed[] = Array.isArray(raw.embeds)
        ? raw.embeds.map((emb: any) => ({
            type: emb.type,
            title: emb.title,
            description: emb.description,
            url: emb.url,
            color: emb.color,
            thumbnailUrl: emb.thumbnail?.url,
            imageUrl: emb.image?.url
        }))
        : [];

    return {
        id: String(raw.id),
        channelId: String(raw.channel_id),
        content: String(raw.content || ""),
        author,
        timestamp: String(raw.timestamp || new Date().toISOString()),
        editedTimestamp: raw.edited_timestamp ? String(raw.edited_timestamp) : null,
        attachments,
        embeds,
        isReply: Boolean(raw.message_reference),
        replyToId: raw.message_reference?.message_id ? String(raw.message_reference.message_id) : undefined
    };
}

export async function fetchAllDmMessages(config: MessageFetcherConfig): Promise<{
    messages: ArchiveMessage[];
    isComplete: boolean;
    status: "complete" | "partial" | "cancelled" | "error";
    statusMessage: string;
}> {
    const allRaw: any[] = [];
    const seenIds = new Set<string>();
    let lastMessageId: string | null = null;
    let batchNumber = 0;
    let isComplete = false;
    let status: "complete" | "partial" | "cancelled" | "error" = "complete";
    let statusMessage = "All accessible messages retrieved.";
    const delayMs = config.batchDelayMs !== undefined ? config.batchDelayMs : 350;

    while (true) {
        if (config.shouldCancel?.()) {
            status = "cancelled";
            statusMessage = "Export cancelled by user.";
            isComplete = false;
            break;
        }

        const query: Record<string, any> = { limit: 100 };
        if (lastMessageId) {
            query.before = lastMessageId;
        }

        let batch: any[] = [];
        try {
            const res = await config.restClient.get({
                url: config.endpoints.MESSAGES(config.channelId),
                query,
                retries: 2
            });
            batch = Array.isArray(res?.body) ? res.body : [];
        } catch (err: any) {
            // Handle HTTP 429 Rate Limit
            if (err?.status === 429 || err?.body?.retry_after) {
                const retrySec = Number(err?.body?.retry_after) || 1.5;
                const retryMs = Math.ceil(retrySec * 1000);
                config.onProgress?.({
                    fetchedCount: allRaw.length,
                    batchNumber,
                    isRateLimited: true,
                    rateLimitRemainingMs: retryMs,
                    isComplete: false
                });
                await new Promise((resolve) => setTimeout(resolve, retryMs));
                continue; // Retry this batch
            }

            // Other unexpected error (e.g. 403, 404, network failure)
            status = "error";
            statusMessage = `Fetch error: ${err?.message || String(err)}`;
            isComplete = false;
            break;
        }

        if (!batch.length) {
            isComplete = true;
            break;
        }

        for (const rawMsg of batch) {
            if (rawMsg?.id && !seenIds.has(rawMsg.id)) {
                seenIds.add(rawMsg.id);
                allRaw.push(rawMsg);
            }
        }

        batchNumber++;
        config.onProgress?.({
            fetchedCount: allRaw.length,
            batchNumber,
            isRateLimited: false,
            isComplete: false
        });

        // If Discord returned fewer than 100 messages, we reached the beginning of history
        if (batch.length < 100) {
            isComplete = true;
            break;
        }

        lastMessageId = batch[batch.length - 1].id;

        if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    // Convert raw messages to structured ArchiveMessage objects
    const includeAttachments = config.filter?.includeAttachments !== false;
    let messages = allRaw.map((raw) => parseRawMessage(raw, includeAttachments));

    // Sort chronologically (oldest message first)
    messages.sort((a, b) => {
        const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        // Tie-break with snowflake ID comparison
        try {
            return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
        } catch {
            return a.id.localeCompare(b.id);
        }
    });

    // Apply date filters if configured
    if (config.filter?.startDate) {
        const startTimestamp = new Date(config.filter.startDate).getTime();
        if (!isNaN(startTimestamp)) {
            messages = messages.filter((m) => new Date(m.timestamp).getTime() >= startTimestamp);
        }
    }

    if (config.filter?.endDate) {
        // End date extends to end of that day (23:59:59.999)
        const endTimestamp = new Date(`${config.filter.endDate}T23:59:59.999Z`).getTime();
        if (!isNaN(endTimestamp)) {
            messages = messages.filter((m) => new Date(m.timestamp).getTime() <= endTimestamp);
        }
    }

    config.onProgress?.({
        fetchedCount: messages.length,
        batchNumber,
        isRateLimited: false,
        isComplete: true
    });

    return {
        messages,
        isComplete,
        status,
        statusMessage
    };
}
