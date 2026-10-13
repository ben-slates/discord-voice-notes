import test from "node:test";
import assert from "node:assert/strict";

import {
    fetchAllDmMessages,
    parseRawMessage,
    buildAvatarUrl
} from "../src/plugins/dmArchive/fetcher";
import {
    generateHtmlArchive,
    generateJsonArchive,
    renderMarkdown,
    escapeHtml,
    formatFileSize,
    formatTimestamp
} from "../src/plugins/dmArchive/formatters";
import {
    resolveChannelInfo,
    executeDmExport
} from "../src/plugins/dmArchive/index";
import {
    ArchiveMessage,
    ArchiveMetadata,
    ArchivePayload
} from "../src/plugins/dmArchive/types";

// Helper to generate mock Discord messages
function createMockDiscordMessage(options: {
    id: string;
    channelId?: string;
    content?: string;
    timestamp?: string;
    username?: string;
    userId?: string;
    attachments?: any[];
    embeds?: any[];
    editedTimestamp?: string | null;
}) {
    return {
        id: options.id,
        channel_id: options.channelId || "123456789",
        content: options.content !== undefined ? options.content : "Hello world",
        author: {
            id: options.userId || "987654321",
            username: options.username || "alice",
            global_name: options.username ? `${options.username}_display` : "Alice Display",
            avatar: "abcdef1234567890",
            bot: false
        },
        timestamp: options.timestamp || new Date(Date.now() - 10000).toISOString(),
        edited_timestamp: options.editedTimestamp || null,
        attachments: options.attachments || [],
        embeds: options.embeds || []
    };
}

test("buildAvatarUrl handles custom hash and default avatars", () => {
    const custom = buildAvatarUrl("123456789", "hash123");
    assert.equal(custom, "https://cdn.discordapp.com/avatars/123456789/hash123.png?size=64");

    const defaultAv = buildAvatarUrl("123456789", null);
    assert.match(defaultAv, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d+\.png$/);
});

test("formatters: escapeHtml, formatFileSize, formatTimestamp, and renderMarkdown", () => {
    assert.equal(escapeHtml("<script>alert('xss') & \"quote\"</script>"), "&lt;script&gt;alert(&#039;xss&#039;) &amp; &quot;quote&quot;&lt;/script&gt;");

    assert.equal(formatFileSize(0), "0 B");
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(2048), "2.0 KB");
    assert.equal(formatFileSize(5242880), "5.0 MB");

    const ts = formatTimestamp("2026-10-13T20:00:00.000Z");
    assert.ok(ts.length > 5);

    const rendered = renderMarkdown("> quote\n**bold** *italic* `code`");
    assert.match(rendered, /<strong>bold<\/strong>/);
    assert.match(rendered, /<em>italic<\/em>/);
    assert.match(rendered, /<code class="inline-code">code<\/code>/);
    assert.match(rendered, /<blockquote class="quote">quote<\/blockquote>/);
});

test("parseRawMessage correctly extracts all message fields", () => {
    const raw = createMockDiscordMessage({
        id: "1001",
        content: "Check this image: `code`",
        attachments: [{
            id: "att_1",
            filename: "screenshot.png",
            size: 204800,
            url: "https://cdn.discordapp.com/attachments/123/screenshot.png",
            content_type: "image/png",
            width: 800,
            height: 600
        }],
        embeds: [{
            type: "rich",
            title: "Embed Title",
            description: "Embed Description",
            url: "https://example.com",
            color: 0x3498db
        }]
    });

    const parsed = parseRawMessage(raw, true);
    assert.equal(parsed.id, "1001");
    assert.equal(parsed.content, "Check this image: `code`");
    assert.equal(parsed.author.username, "alice");
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0].filename, "screenshot.png");
    assert.equal(parsed.embeds.length, 1);
    assert.equal(parsed.embeds[0].title, "Embed Title");
});

test("Short DM: fetches full conversation in a single batch (< 100 messages)", async () => {
    const mockMessages = [
        createMockDiscordMessage({ id: "20", timestamp: "2026-10-10T12:05:00Z", content: "Third message" }),
        createMockDiscordMessage({ id: "10", timestamp: "2026-10-10T12:00:00Z", content: "Second message" }),
        createMockDiscordMessage({ id: "01", timestamp: "2026-10-10T11:55:00Z", content: "First message" })
    ];

    let getCalls = 0;
    const mockRestClient = {
        get: async (req: any) => {
            getCalls++;
            assert.equal(req.url, "/channels/dm1/messages");
            assert.equal(req.query.limit, 100);
            return { body: mockMessages };
        }
    };

    const endpoints = { MESSAGES: (id: string) => `/channels/${id}/messages` };
    const progressLog: number[] = [];

    const result = await fetchAllDmMessages({
        channelId: "dm1",
        restClient: mockRestClient,
        endpoints,
        batchDelayMs: 0,
        onProgress: (p) => progressLog.push(p.fetchedCount)
    });

    assert.equal(getCalls, 1);
    assert.equal(result.isComplete, true);
    assert.equal(result.status, "complete");
    assert.equal(result.messages.length, 3);
    // Messages must be sorted chronologically (oldest first)
    assert.equal(result.messages[0].id, "01");
    assert.equal(result.messages[1].id, "10");
    assert.equal(result.messages[2].id, "20");
});

test("Long DM: paginates across multiple batches with 'before' token", async () => {
    // 250 total messages: Batch 1 (100), Batch 2 (100), Batch 3 (50)
    const batches: any[][] = [];

    let currentId = 250;
    for (let b = 0; b < 3; b++) {
        const batchSize = b === 2 ? 50 : 100;
        const currentBatch: any[] = [];
        for (let i = 0; i < batchSize; i++) {
            currentBatch.push(createMockDiscordMessage({
                id: String(currentId).padStart(5, "0"),
                content: `Message ${currentId}`,
                timestamp: new Date(1700000000000 + currentId * 1000).toISOString()
            }));
            currentId--;
        }
        batches.push(currentBatch);
    }

    let batchReqIdx = 0;
    const capturedBeforeTokens: (string | undefined)[] = [];

    const mockRestClient = {
        get: async (req: any) => {
            capturedBeforeTokens.push(req.query?.before);
            const batch = batches[batchReqIdx++] || [];
            return { body: batch };
        }
    };

    const result = await fetchAllDmMessages({
        channelId: "long_dm",
        restClient: mockRestClient,
        endpoints: { MESSAGES: (id) => `/channels/${id}/messages` },
        batchDelayMs: 0
    });

    assert.equal(batchReqIdx, 3);
    assert.equal(result.isComplete, true);
    assert.equal(result.status, "complete");
    assert.equal(result.messages.length, 250);
    // Verified pagination before tokens
    assert.equal(capturedBeforeTokens[0], undefined);
    assert.equal(capturedBeforeTokens[1], "00151");
    assert.equal(capturedBeforeTokens[2], "00051");

    // Chronological ordering check
    assert.equal(result.messages[0].id, "00001");
    assert.equal(result.messages[249].id, "00250");
});

test("Group DM: resolves channel name and recipients correctly", () => {
    const gdmChannel = {
        id: "gdm_999",
        name: "Cool Squad",
        type: 3,
        recipients: [
            { id: "1", username: "alice", globalName: "Alice A." },
            { id: "2", username: "bob", globalName: "Bob B." },
            { id: "3", username: "charlie" }
        ]
    };

    const resolved = resolveChannelInfo(gdmChannel, "1");
    assert.equal(resolved.type, "GROUP_DM");
    assert.equal(resolved.name, "Cool Squad");
    assert.equal(resolved.recipients.length, 3);
});

test("Direct message: handles nameless DM by formatting recipient names", () => {
    const directChannel = {
        id: "dm_123",
        type: 1,
        recipients: [
            { id: "current_user", username: "me" },
            { id: "partner_user", username: "dave", global_name: "Dave D." }
        ]
    };

    const resolved = resolveChannelInfo(directChannel, "current_user");
    assert.equal(resolved.type, "DM");
    assert.equal(resolved.name, "Dave D.");
});

test("Rate Limit (HTTP 429): gracefully backs off and retries", async () => {
    let callCount = 0;
    const rateLimitEvents: boolean[] = [];

    const mockRestClient = {
        get: async () => {
            callCount++;
            if (callCount === 1) {
                // Return rate limit 429
                const err: any = new Error("Rate limit");
                err.status = 429;
                err.body = { retry_after: 0.05 }; // 50ms
                throw err;
            }
            return {
                body: [
                    createMockDiscordMessage({ id: "101", content: "Post rate limit message" })
                ]
            };
        }
    };

    const result = await fetchAllDmMessages({
        channelId: "rate_limit_dm",
        restClient: mockRestClient,
        endpoints: { MESSAGES: (id) => `/channels/${id}/messages` },
        batchDelayMs: 0,
        onProgress: (p) => {
            if (p.isRateLimited) rateLimitEvents.push(true);
        }
    });

    assert.equal(callCount, 2);
    assert.equal(rateLimitEvents.length, 1);
    assert.equal(result.isComplete, true);
    assert.equal(result.messages.length, 1);
});

test("User cancellation: cleanly stops fetching and marks export as partial", async () => {
    let callCount = 0;
    let cancel = false;

    const mockRestClient = {
        get: async () => {
            callCount++;
            if (callCount === 1) {
                cancel = true; // User cancels during/after first batch
                const batch = [];
                for (let i = 0; i < 100; i++) {
                    batch.push(createMockDiscordMessage({ id: `msg_${i}` }));
                }
                return { body: batch };
            }
            return { body: [] };
        }
    };

    const result = await fetchAllDmMessages({
        channelId: "cancel_dm",
        restClient: mockRestClient,
        endpoints: { MESSAGES: (id) => `/channels/${id}/messages` },
        batchDelayMs: 0,
        shouldCancel: () => cancel
    });

    assert.equal(result.isComplete, false);
    assert.equal(result.status, "cancelled");
    assert.match(result.statusMessage, /cancelled/i);
    assert.equal(result.messages.length, 100);
});

test("Date filtering: filters messages by start and end date bounds", async () => {
    const rawMessages = [
        createMockDiscordMessage({ id: "1", timestamp: "2026-01-01T10:00:00Z", content: "Old" }),
        createMockDiscordMessage({ id: "2", timestamp: "2026-05-15T10:00:00Z", content: "Target 1" }),
        createMockDiscordMessage({ id: "3", timestamp: "2026-05-20T10:00:00Z", content: "Target 2" }),
        createMockDiscordMessage({ id: "4", timestamp: "2026-09-01T10:00:00Z", content: "Future" })
    ];

    const result = await fetchAllDmMessages({
        channelId: "filter_dm",
        restClient: { get: async () => ({ body: rawMessages }) },
        endpoints: { MESSAGES: (id) => `/channels/${id}/messages` },
        batchDelayMs: 0,
        filter: {
            startDate: "2026-05-01",
            endDate: "2026-05-31",
            includeAttachments: true,
            format: "json"
        }
    });

    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].id, "2");
    assert.equal(result.messages[1].id, "3");
});

test("HTML and JSON generation parity and format integrity", async () => {
    const channelInfo = {
        id: "channel_abc",
        name: "Testing Transcript",
        type: "DM" as const,
        recipients: [
            { id: "1", username: "user1", globalName: "User One" }
        ]
    };

    const mockMessages: ArchiveMessage[] = [
        {
            id: "m1",
            channelId: "channel_abc",
            content: "Check this `inline code` and ```python\nprint('hello')\n```",
            author: { id: "1", username: "user1", globalName: "User One" },
            timestamp: "2026-10-10T12:00:00Z",
            editedTimestamp: null,
            attachments: [{
                id: "att_1",
                filename: "picture.png",
                size: 1048576,
                url: "https://example.com/picture.png",
                contentType: "image/png"
            }],
            embeds: [{
                title: "Test Embed",
                description: "Sample description",
                color: 0x7289da
            }]
        },
        {
            id: "m2",
            channelId: "channel_abc",
            content: "Another note with emoji 🚀 and **bold** text",
            author: { id: "1", username: "user1" },
            timestamp: "2026-10-10T12:05:00Z",
            editedTimestamp: "2026-10-10T12:06:00Z",
            attachments: [],
            embeds: []
        }
    ];

    const metadata: ArchiveMetadata = {
        version: "1.0.0",
        exportedAt: "2026-10-13T20:00:00Z",
        isComplete: true,
        status: "complete",
        channel: channelInfo,
        filter: { startDate: null, endDate: null, includeAttachments: true },
        totalMessages: 2
    };

    // JSON export test
    const jsonStr = generateJsonArchive(metadata, mockMessages);
    const parsedJson: ArchivePayload = JSON.parse(jsonStr);
    assert.equal(parsedJson.metadata.isComplete, true);
    assert.equal(parsedJson.metadata.totalMessages, 2);
    assert.equal(parsedJson.messages.length, 2);
    assert.equal(parsedJson.messages[0].id, "m1");
    assert.equal(parsedJson.messages[1].id, "m2");

    // HTML export test
    const htmlStr = generateHtmlArchive(metadata, mockMessages);
    assert.match(htmlStr, /<!DOCTYPE html>/);
    assert.match(htmlStr, /Testing Transcript/);
    assert.match(htmlStr, /Complete Archive/); // Badge check
    assert.match(htmlStr, /inline code/);
    assert.match(htmlStr, /print\(&#039;hello&#039;\)/);
    assert.match(htmlStr, /picture\.png/);
    assert.match(htmlStr, /Test Embed/);
    assert.match(htmlStr, /🚀/);
    assert.match(htmlStr, /<strong>bold<\/strong>/);
    assert.match(htmlStr, /\(edited\)/);

    // Partial export banner test
    const partialMetadata: ArchiveMetadata = {
        ...metadata,
        isComplete: false,
        status: "partial",
        statusMessage: "Interrupted by user"
    };
    const partialHtml = generateHtmlArchive(partialMetadata, mockMessages);
    assert.match(partialHtml, /Partial Archive/);
    assert.match(partialHtml, /Interrupted by user/);
});

test("executeDmExport returns matching filenames and payloads for both formats", async () => {
    const channel = {
        id: "dm_export_run",
        name: "Alice Bob",
        type: "DM" as const,
        recipients: [{ id: "1", username: "alice" }]
    };

    const mockRaw = [
        createMockDiscordMessage({ id: "1", content: "Exported message" })
    ];

    const result = await executeDmExport({
        channel,
        restClient: { get: async () => ({ body: mockRaw }) },
        endpoints: { MESSAGES: (id) => `/channels/${id}/messages` },
        filter: {
            includeAttachments: true,
            format: "both",
            customFilename: "my_custom_backup"
        },
        batchDelayMs: 0
    });

    assert.equal(result.filenames.html, "my_custom_backup.html");
    assert.equal(result.filenames.json, "my_custom_backup.json");
    assert.ok(result.htmlContent && result.htmlContent.length > 500);
    assert.ok(result.jsonContent && result.jsonContent.length > 100);
    assert.equal(result.payload.messages.length, 1);
});
