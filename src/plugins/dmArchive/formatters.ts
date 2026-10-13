/**
 * HTML and JSON transcript generators for DM Archive.
 */

import { ArchiveMetadata, ArchiveMessage, ArchivePayload } from "./types";

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(isoStr: string): string {
    try {
        const d = new Date(isoStr);
        return d.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });
    } catch {
        return isoStr;
    }
}

/**
 * Parses basic Discord markdown: code blocks, inline code, bold, italics, underline, strikethrough, blockquotes, and URLs.
 */
export function renderMarkdown(content: string): string {
    if (!content) return "";

    // 1. Extract code blocks to avoid mangling internal markdown
    const codeBlocks: string[] = [];
    let processed = content.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
        const idx = codeBlocks.length;
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        codeBlocks.push(`<pre class="codeblock"><code${langClass}>${escapeHtml(code)}</code></pre>`);
        return `@@CODEBLOCK_${idx}@@`;
    });

    // 2. Extract inline code
    const inlineCodes: string[] = [];
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(`<code class="inline-code">${escapeHtml(code)}</code>`);
        return `@@INLINECODE_${idx}@@`;
    });

    // 3. Escape general HTML
    processed = escapeHtml(processed);

    // 4. URLs to links
    processed = processed.replace(
        /(https?:\/\/[^\s<>"]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>'
    );

    // 5. Bold & Italic (***text***)
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold (**text**)
    processed = processed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic (*text* or _text_)
    processed = processed.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
    // Underline (__text__)
    processed = processed.replace(/__(.+?)__/g, "<u>$1</u>");
    // Strikethrough (~~text~~)
    processed = processed.replace(/~~(.+?)~~/g, "<del>$1</del>");

    // 6. Blockquotes (> text)
    processed = processed.replace(/^(&gt;|>)\s?(.*)$/gm, '<blockquote class="quote">$2</blockquote>');

    // 7. Line breaks
    processed = processed.replace(/\n/g, "<br>");

    // 8. Restore code blocks & inline code
    inlineCodes.forEach((codeHtml, idx) => {
        processed = processed.replace(`@@INLINECODE_${idx}@@`, codeHtml);
    });
    codeBlocks.forEach((codeHtml, idx) => {
        processed = processed.replace(`@@CODEBLOCK_${idx}@@`, codeHtml);
    });

    return processed;
}

export function generateJsonArchive(metadata: ArchiveMetadata, messages: ArchiveMessage[]): string {
    const payload: ArchivePayload = {
        metadata: {
            ...metadata,
            totalMessages: messages.length
        },
        messages
    };
    return JSON.stringify(payload, null, 2);
}

export function generateHtmlArchive(metadata: ArchiveMetadata, messages: ArchiveMessage[]): string {
    const channelName = escapeHtml(metadata.channel.name || `DM (${metadata.channel.id})`);
    const isComplete = metadata.isComplete;
    const recipientsList = metadata.channel.recipients
        .map((r) => escapeHtml(r.globalName ? `${r.globalName} (@${r.username})` : `@${r.username}`))
        .join(", ");

    const dateRangeStr = metadata.filter.startDate || metadata.filter.endDate
        ? `${metadata.filter.startDate || "Beginning"} to ${metadata.filter.endDate || "Latest"}`
        : "Full History";

    const messagesHtml = messages
        .map((msg) => {
            const author = msg.author;
            const authorDisplay = escapeHtml(author.globalName || author.username);
            const authorUsername = escapeHtml(author.username);
            const timeStr = formatTimestamp(msg.timestamp);
            const editedStr = msg.editedTimestamp
                ? `<span class="edited-badge" title="Edited: ${formatTimestamp(msg.editedTimestamp)}">(edited)</span>`
                : "";

            const contentHtml = renderMarkdown(msg.content);

            // Attachments
            let attachmentsHtml = "";
            if (msg.attachments && msg.attachments.length > 0) {
                attachmentsHtml = `<div class="attachments-list">` +
                    msg.attachments.map((att) => {
                        const isImage = att.contentType?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(att.filename);
                        const safeUrl = escapeHtml(att.url);
                        const safeFilename = escapeHtml(att.filename);
                        const sizeStr = formatFileSize(att.size);

                        if (isImage) {
                            return `
                                <div class="attachment-item attachment-image">
                                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                                        <img src="${safeUrl}" alt="${safeFilename}" loading="lazy" />
                                    </a>
                                    <div class="attachment-meta">
                                        <a href="${safeUrl}" target="_blank" class="attachment-name">${safeFilename}</a>
                                        <span class="attachment-size">${sizeStr}</span>
                                    </div>
                                </div>
                            `;
                        } else {
                            return `
                                <div class="attachment-item attachment-file">
                                    <div class="file-icon">&#128196;</div>
                                    <div class="attachment-meta">
                                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="attachment-name">${safeFilename}</a>
                                        <span class="attachment-size">${sizeStr}</span>
                                    </div>
                                </div>
                            `;
                        }
                    }).join("") +
                    `</div>`;
            }

            // Embeds
            let embedsHtml = "";
            if (msg.embeds && msg.embeds.length > 0) {
                embedsHtml = `<div class="embeds-list">` +
                    msg.embeds.map((emb) => {
                        const title = emb.title ? `<div class="embed-title"><a href="${escapeHtml(emb.url || "#")}" target="_blank">${escapeHtml(emb.title)}</a></div>` : "";
                        const desc = emb.description ? `<div class="embed-desc">${renderMarkdown(emb.description)}</div>` : "";
                        const img = emb.imageUrl ? `<div class="embed-image"><img src="${escapeHtml(emb.imageUrl)}" loading="lazy" /></div>` : "";
                        const colorStyle = emb.color ? `style="border-left-color: #${emb.color.toString(16).padStart(6, "0")};"` : "";
                        return `
                            <div class="embed-card" ${colorStyle}>
                                ${title}
                                ${desc}
                                ${img}
                            </div>
                        `;
                    }).join("") +
                    `</div>`;
            }

            return `
                <div class="chat-message" id="msg-${msg.id}">
                    <div class="avatar-col">
                        <img class="avatar" src="${escapeHtml(author.avatarUrl || "")}" alt="${authorUsername}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
                    </div>
                    <div class="body-col">
                        <div class="message-header">
                            <span class="author-name">${authorDisplay}</span>
                            <span class="author-tag">@${authorUsername}</span>
                            <time class="timestamp" datetime="${msg.timestamp}">${timeStr}</time>
                            ${editedStr}
                            <span class="msg-id">#${msg.id}</span>
                        </div>
                        <div class="message-content">${contentHtml}</div>
                        ${attachmentsHtml}
                        ${embedsHtml}
                    </div>
                </div>
            `;
        })
        .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DM Archive — ${channelName}</title>
    <style>
        :root {
            --bg-primary: #313338;
            --bg-secondary: #2b2d31;
            --bg-tertiary: #1e1f22;
            --bg-accent: #383a40;
            --text-normal: #dbdee1;
            --text-muted: #949ba4;
            --text-heading: #ffffff;
            --interactive-hover: #ffffff;
            --link-color: #00a8fc;
            --border-subtle: rgba(255, 255, 255, 0.08);
            --code-bg: #1e1f22;
            --success-color: #23a55a;
            --warning-color: #f0b232;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-normal);
            line-height: 1.45;
            font-size: 15px;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }

        /* Top Header */
        header.archive-header {
            background-color: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-subtle);
            padding: 16px 24px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        .header-title-section h1 {
            color: var(--text-heading);
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-badge {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            padding: 3px 8px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }

        .status-badge.complete {
            background-color: rgba(35, 165, 90, 0.2);
            color: var(--success-color);
            border: 1px solid rgba(35, 165, 90, 0.4);
        }

        .status-badge.partial {
            background-color: rgba(240, 178, 50, 0.2);
            color: var(--warning-color);
            border: 1px solid rgba(240, 178, 50, 0.4);
        }

        .header-meta {
            margin-top: 8px;
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 13px;
            color: var(--text-muted);
        }

        .header-meta span strong {
            color: var(--text-normal);
        }

        /* Search Bar in Header */
        .search-container {
            display: flex;
            align-items: center;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 4px 10px;
        }

        .search-container input {
            background: transparent;
            border: none;
            color: var(--text-heading);
            font-size: 13px;
            outline: none;
            width: 180px;
        }

        .search-container input::placeholder {
            color: var(--text-muted);
        }

        /* Main Chat Container */
        main.chat-container {
            max-width: 1200px;
            width: 100%;
            margin: 0 auto;
            padding: 24px 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        /* Message item */
        .chat-message {
            display: flex;
            gap: 14px;
            padding: 6px 10px;
            border-radius: 6px;
            transition: background 0.1s ease;
        }

        .chat-message:hover {
            background-color: rgba(0, 0, 0, 0.08);
        }

        .avatar-col {
            flex-shrink: 0;
            width: 40px;
            height: 40px;
        }

        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background-color: var(--bg-tertiary);
            object-fit: cover;
        }

        .body-col {
            flex: 1;
            min-width: 0;
        }

        .message-header {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 2px;
        }

        .author-name {
            color: var(--text-heading);
            font-weight: 600;
            font-size: 15px;
        }

        .author-tag {
            color: var(--text-muted);
            font-size: 12px;
        }

        .timestamp {
            color: var(--text-muted);
            font-size: 12px;
        }

        .edited-badge {
            color: var(--text-muted);
            font-size: 11px;
            font-style: italic;
        }

        .msg-id {
            color: rgba(255, 255, 255, 0.2);
            font-size: 10px;
            margin-left: auto;
            font-family: monospace;
        }

        .message-content {
            color: var(--text-normal);
            word-break: break-word;
            font-size: 14.5px;
            line-height: 1.5;
        }

        /* Markdown Styling */
        a.chat-link {
            color: var(--link-color);
            text-decoration: none;
        }
        a.chat-link:hover {
            text-decoration: underline;
        }

        code.inline-code {
            background-color: var(--code-bg);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 85%;
        }

        pre.codeblock {
            background-color: var(--code-bg);
            border: 1px solid var(--border-subtle);
            border-radius: 5px;
            padding: 8px 12px;
            margin: 6px 0;
            overflow-x: auto;
            font-family: Consolas, "Courier New", monospace;
            font-size: 13px;
            color: #d1d5db;
        }

        blockquote.quote {
            border-left: 4px solid var(--bg-accent);
            padding-left: 10px;
            color: var(--text-muted);
            margin: 4px 0;
        }

        /* Attachments */
        .attachments-list {
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .attachment-item {
            display: inline-flex;
            align-items: center;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 8px 12px;
            max-width: 500px;
            gap: 10px;
        }

        .attachment-image {
            flex-direction: column;
            align-items: flex-start;
            padding: 6px;
        }

        .attachment-image img {
            max-width: 100%;
            max-height: 350px;
            border-radius: 4px;
            display: block;
        }

        .file-icon {
            font-size: 20px;
        }

        .attachment-meta {
            display: flex;
            flex-direction: column;
            font-size: 13px;
        }

        .attachment-name {
            color: var(--link-color);
            text-decoration: none;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .attachment-name:hover {
            text-decoration: underline;
        }

        .attachment-size {
            color: var(--text-muted);
            font-size: 11px;
        }

        /* Embeds */
        .embeds-list {
            margin-top: 6px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .embed-card {
            background-color: var(--bg-secondary);
            border-left: 4px solid var(--link-color);
            border-radius: 4px;
            padding: 10px 14px;
            max-width: 520px;
        }

        .embed-title a {
            color: var(--link-color);
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
        }
        .embed-title a:hover {
            text-decoration: underline;
        }

        .embed-desc {
            font-size: 13px;
            color: var(--text-normal);
            margin-top: 4px;
        }

        .embed-image img {
            max-width: 100%;
            max-height: 300px;
            border-radius: 4px;
            margin-top: 8px;
        }

        /* Footer */
        footer.archive-footer {
            background-color: var(--bg-tertiary);
            border-top: 1px solid var(--border-subtle);
            text-align: center;
            padding: 16px;
            font-size: 12px;
            color: var(--text-muted);
        }
    </style>
</head>
<body>
    <header class="archive-header">
        <div class="header-top">
            <div class="header-title-section">
                <h1>
                    <span>&#128172;</span> ${channelName}
                    <span class="status-badge ${isComplete ? "complete" : "partial"}">
                        ${isComplete ? "&#10003; Complete Archive" : "&#9888; Partial Archive"}
                    </span>
                </h1>
            </div>
            <div class="search-container">
                <input type="text" id="transcript-search" placeholder="Filter messages..." oninput="filterMessages(this.value)" />
            </div>
        </div>
        <div class="header-meta">
            <span>Recipients: <strong>${recipientsList}</strong></span>
            <span>Messages: <strong id="msg-counter">${messages.length}</strong></span>
            <span>Date Range: <strong>${dateRangeStr}</strong></span>
            <span>Exported: <strong>${formatTimestamp(metadata.exportedAt)}</strong></span>
            <span>Status: <strong>${escapeHtml(metadata.statusMessage || (isComplete ? "Complete" : "Partial"))}</strong></span>
        </div>
    </header>
    ${!isComplete ? `
    <div style="background: rgba(240, 178, 50, 0.15); border-left: 4px solid var(--warning-color); padding: 12px 24px; color: #ffdc7a; font-size: 14px; margin: 12px 24px 0 24px; border-radius: 4px;">
        <strong>&#9888; Partial Archive:</strong> ${escapeHtml(metadata.statusMessage || "This export was interrupted or cancelled and does not contain full history.")}
    </div>` : ""}

    <main class="chat-container" id="chat-messages-container">
        ${messagesHtml}
    </main>

    <footer class="archive-footer">
        Generated locally by Vencord DM Archive Plugin &bull; End-to-End Client Export &bull; No external transmission
    </footer>

    <script>
        function filterMessages(query) {
            const q = query.toLowerCase().trim();
            const messages = document.querySelectorAll(".chat-message");
            let visibleCount = 0;
            messages.forEach(msg => {
                const text = msg.innerText.toLowerCase();
                if (!q || text.includes(q)) {
                    msg.style.display = "flex";
                    visibleCount++;
                } else {
                    msg.style.display = "none";
                }
            });
            document.getElementById("msg-counter").textContent = visibleCount + " of " + messages.length;
        }
    </script>
</body>
</html>`;
}
