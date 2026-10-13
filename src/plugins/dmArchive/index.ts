/**
 * DM Archive - Vencord Custom User Plugin
 *
 * Exports message history of individual Discord DMs or Group DMs
 * to styled offline HTML transcripts and structured JSON backups.
 */

import {
    ArchiveFilterOptions,
    ArchiveMetadata,
    ArchivePayload,
    ArchiveChannelInfo,
    ArchiveAuthor,
    FetchProgress
} from "./types";
import { fetchAllDmMessages, buildAvatarUrl } from "./fetcher";
import { generateHtmlArchive, generateJsonArchive } from "./formatters";

export type {
    ArchiveAuthor,
    ArchiveAttachment,
    ArchiveEmbed,
    ArchiveMessage,
    ArchiveFilterOptions,
    ArchiveChannelInfo,
    ArchiveMetadata,
    ArchivePayload,
    FetchProgress
} from "./types";
export { fetchAllDmMessages, buildAvatarUrl, parseRawMessage } from "./fetcher";
export { generateHtmlArchive, generateJsonArchive, renderMarkdown, escapeHtml } from "./formatters";

/**
 * Triggers a client-side file download using Blob and ObjectURL.
 * 100% offline, zero server communication.
 */
export function triggerBlobDownload(content: string, filename: string, mimeType: string = "text/plain;charset=utf-8"): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Resolves DM or Group DM channel info from available Discord stores or channel object.
 */
export function resolveChannelInfo(channel: any, currentUserId?: string): ArchiveChannelInfo {
    const channelId = String(channel?.id || "0");
    const isGroup = Boolean(
        channel?.type === 3 ||
        (channel?.type !== 1 && channel?.isGroupDM?.()) ||
        (channel?.type !== 1 && !channel?.isDM?.() && Array.isArray(channel?.recipients) && channel.recipients.length > 2)
    );

    const recipients: ArchiveAuthor[] = [];
    if (Array.isArray(channel?.recipients)) {
        for (const r of channel.recipients) {
            const rawUser = typeof r === "object" ? r : { id: r };
            recipients.push({
                id: String(rawUser.id || "0"),
                username: String(rawUser.username || "User"),
                globalName: rawUser.globalName || rawUser.global_name,
                avatarUrl: buildAvatarUrl(String(rawUser.id || "0"), rawUser.avatar),
                bot: Boolean(rawUser.bot)
            });
        }
    }

    let channelName = channel?.name || "";
    if (!channelName) {
        if (recipients.length > 0) {
            const others = currentUserId
                ? recipients.filter(u => u.id !== currentUserId)
                : recipients;
            channelName = (others.length ? others : recipients)
                .map(u => u.globalName || u.username)
                .join(", ");
        } else {
            channelName = `DM (${channelId})`;
        }
    }

    return {
        id: channelId,
        name: channelName,
        type: isGroup ? "GROUP_DM" : "DM",
        recipients
    };
}

/**
 * Executes the full export pipeline for a channel with given filter options.
 */
export async function executeDmExport(params: {
    channel: ArchiveChannelInfo;
    restClient: { get: (req: any) => Promise<any> };
    endpoints: { MESSAGES: (channelId: string) => string };
    filter: ArchiveFilterOptions;
    onProgress?: (progress: FetchProgress) => void;
    shouldCancel?: () => boolean;
    batchDelayMs?: number;
}): Promise<{
    payload: ArchivePayload;
    htmlContent?: string;
    jsonContent?: string;
    filenames: { html?: string; json?: string };
}> {
    const { channel, restClient, endpoints, filter, onProgress, shouldCancel, batchDelayMs } = params;

    const result = await fetchAllDmMessages({
        channelId: channel.id,
        restClient,
        endpoints,
        filter,
        onProgress,
        shouldCancel,
        batchDelayMs
    });

    const metadata: ArchiveMetadata = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        isComplete: result.isComplete,
        status: result.status,
        statusMessage: result.statusMessage,
        channel,
        filter: {
            startDate: filter.startDate || null,
            endDate: filter.endDate || null,
            includeAttachments: filter.includeAttachments
        },
        totalMessages: result.messages.length
    };

    const payload: ArchivePayload = {
        metadata,
        messages: result.messages
    };

    const dateSlug = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeChannelName = channel.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "dm_archive";
    const baseFilename = filter.customFilename?.trim()
        ? filter.customFilename.trim().replace(/\.(html|json)$/i, "")
        : `${safeChannelName}_${dateSlug}`;

    let htmlContent: string | undefined;
    let jsonContent: string | undefined;
    const filenames: { html?: string; json?: string } = {};

    if (filter.format === "html" || filter.format === "both") {
        htmlContent = generateHtmlArchive(metadata, result.messages);
        filenames.html = `${baseFilename}.html`;
    }

    if (filter.format === "json" || filter.format === "both") {
        jsonContent = generateJsonArchive(metadata, result.messages);
        filenames.json = `${baseFilename}.json`;
    }

    return {
        payload,
        htmlContent,
        jsonContent,
        filenames
    };
}

/**
 * Standard Vencord Plugin Definition for DM Archive.
 */
export const dmArchivePlugin = {
    name: "DMArchive",
    description: "Export message history of individual Discord DMs and Group DMs to beautiful standalone HTML transcripts and structured JSON backups.",
    authors: [
        {
            name: "Ven",
            id: 0n
        }
    ],
    tags: ["Chat", "Utility", "Messages", "Backup"],

    contextMenus: {
        "channel-context": (children: any[], props: any) => {
            const channel = props?.channel;
            if (!channel) return;
            // Only show for DM (type 1) or Group DM (type 3)
            const isDM = channel.type === 1 || channel.type === 3 || channel.isDM?.() || channel.isGroupDM?.();
            if (!isDM) return;

            children.push({
                type: "item",
                id: "vc-export-dm-archive",
                label: "Export DM History",
                action: () => {
                    if (typeof window !== "undefined" && (window as any).openDmArchiveModal) {
                        (window as any).openDmArchiveModal(channel.id);
                    }
                }
            });
        },
        "gdm-context": (children: any[], props: any) => {
            const channel = props?.channel;
            if (!channel) return;

            children.push({
                type: "item",
                id: "vc-export-gdm-archive",
                label: "Export Group DM History",
                action: () => {
                    if (typeof window !== "undefined" && (window as any).openDmArchiveModal) {
                        (window as any).openDmArchiveModal(channel.id);
                    }
                }
            });
        },
        "user-context": (children: any[], props: any) => {
            const user = props?.user;
            if (!user) return;

            children.push({
                type: "item",
                id: "vc-export-user-dm-archive",
                label: "Export DM History",
                action: () => {
                    if (typeof window !== "undefined" && (window as any).openDmArchiveModalForUser) {
                        (window as any).openDmArchiveModalForUser(user.id);
                    }
                }
            });
        }
    },

    start() {
        console.log("[DMArchive] Plugin loaded successfully.");
    },

    stop() {
        console.log("[DMArchive] Plugin unloaded.");
    }
};

export default dmArchivePlugin;
