const fs = require("fs");
const path = require("path");

const rendererPaths = [
    path.join(__dirname, "../vencord/dist/renderer.js"),
    path.join(__dirname, "../windows/embed/dist/renderer.js")
];

const cssPaths = [
    path.join(__dirname, "../vencord/dist/renderer.css"),
    path.join(__dirname, "../windows/embed/dist/renderer.css")
];

// Production implementation of SplitLargeMessages and CatboxUploadButton
const splitPluginCode = `var _isSplittingSend = false;
function _splitMsgSmart(text, maxLen) {
    if (!text || text.length <= maxLen) return [text];
    function adjustSplitForUnicode(str, idx) {
        if (idx <= 0) return idx;
        if (idx >= str.length) return str.length;
        var prevCode = str.charCodeAt(idx - 1);
        if (prevCode >= 0xD800 && prevCode <= 0xDBFF) idx--;
        if (idx > 0 && (str.charCodeAt(idx - 1) === 0x200D || str.charCodeAt(idx - 1) === 0xFE0F)) {
            idx--;
            if (idx > 1 && str.charCodeAt(idx - 2) >= 0xDC00 && str.charCodeAt(idx - 2) <= 0xDFFF) idx -= 2;
        }
        return idx;
    }
    var chunks = [];
    var remaining = text;
    var inCodeBlock = false;
    var codeLanguage = "";
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) { chunks.push(remaining); break; }
        var budget = inCodeBlock ? maxLen - 6 : maxLen;
        var splitIdx = -1;
        var pIdx = remaining.lastIndexOf("\\n\\n", budget);
        if (pIdx > budget * 0.3) splitIdx = pIdx + 2;
        if (splitIdx === -1) {
            var nIdx = remaining.lastIndexOf("\\n", budget);
            if (nIdx > budget * 0.3) splitIdx = nIdx + 1;
        }
        if (splitIdx === -1) {
            var sIdx = remaining.lastIndexOf(" ", budget);
            if (sIdx > budget * 0.3) splitIdx = sIdx + 1;
        }
        if (splitIdx === -1) {
            splitIdx = adjustSplitForUnicode(remaining, budget);
            if (splitIdx <= 0) splitIdx = budget;
        }
        var chunk = remaining.slice(0, splitIdx);
        remaining = remaining.slice(splitIdx);
        var fenceMatches = [...chunk.matchAll(/\`\`\`([a-zA-Z0-9_-]*)/g)];
        for (var f = 0; f < fenceMatches.length; f++) {
            var match = fenceMatches[f];
            if (!inCodeBlock) { inCodeBlock = true; codeLanguage = match[1] || ""; }
            else { inCodeBlock = false; codeLanguage = ""; }
        }
        if (inCodeBlock) {
            chunk += "\\n\`\`\`";
            remaining = "\`\`\`" + codeLanguage + "\\n" + remaining;
        }
        chunks.push(chunk);
    }
    return chunks;
}
var _splitLargeMessagesPlugin = h({
    name: "SplitLargeMessages",
    description: "Splits messages exceeding the Discord character limit (2000 chars / 4000 Nitro) and automatically sends consecutive chunks safely.",
    tags: ["Chat", "Utility", "Messages"],
    authors: [m.Ven],
    stop: function() { _isSplittingSend = false; },
    onBeforeMessageSend: function(e, t) {
        if (_isSplittingSend) return;
        if (!t || typeof t.content !== "string") return;
        var r = t.content;
        var maxLimit = (k.getCurrentUser()?.premiumType === 2 ? 4000 : 2000);
        var safeMax = maxLimit - 50;
        if (r.length <= safeMax) return;
        var chunks = _splitMsgSmart(r, safeMax);
        if (!chunks || chunks.length <= 1) return;
        console.log("[SplitLargeMessages] Oversized message detected: length=" + r.length + ", splitting into " + chunks.length + " chunks");
        t.content = chunks[0];
        var remaining = chunks.slice(1);
        (async function() {
            _isSplittingSend = true;
            try {
                for (var i = 0; i < remaining.length; i++) {
                    await new Promise(function(res) { setTimeout(res, 650); });
                    console.log("[SplitLargeMessages] Sending part " + (i + 2) + "/" + chunks.length + " (len=" + remaining[i].length + ")");
                    try {
                        await bi(e, { content: remaining[i] });
                    } catch (err) {
                        console.error("[SplitLargeMessages] Failed to send part " + (i + 2) + "/" + chunks.length, err);
                        se("Failed to send split part " + (i + 2) + "/" + chunks.length + ": " + (err.message || String(err)), "failure");
                        break;
                    }
                }
                se("Successfully split and sent " + chunks.length + " messages", "success");
            } catch (err) {
                console.error("[SplitLargeMessages] Error in send sequence:", err);
            } finally {
                _isSplittingSend = false;
            }
        })();
    }
});`;

const catboxCode = `function _triggerCatboxUpload() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "*/*";
    inp.onchange = async function(ev) {
        var f = ev.target?.files?.[0];
        if (!f) return;
        se("Uploading " + f.name + " (" + (f.size / (1024*1024)).toFixed(1) + " MB) to Catbox...", "info");
        try {
            var fd = new FormData();
            fd.append("reqtype", "fileupload");
            fd.append("fileToUpload", f, f.name);
            var res = await fetch("https://catbox.moe/user/api.php", {
                method: "POST",
                body: fd
            });
            var txt = (await res.text()).trim();
            if (txt.startsWith("http://") || txt.startsWith("https://")) {
                var cid = Ee.getChannelId();
                if (cid) bi(cid, { content: txt });
                else Vi(txt);
                se("File uploaded successfully to Catbox!", "success");
            } else {
                se("Catbox upload failed: " + txt.slice(0, 100), "failure");
            }
        } catch (err) {
            se("Upload failed: " + (err.message || String(err)), "failure");
        }
    };
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.click();
    document.body.removeChild(inp);
}

var _catboxCtxPatch = function(e, t) {
    if (t?.channel?.guild_id && !(Ie.can(de.SEND_MESSAGES, t.channel))) return;
    e.push(r(I.MenuItem, {
        id: "vc-upload-to-catbox",
        iconLeft: so,
        leadingAccessory: { type: "icon", icon: so },
        label: "Upload Large File (Catbox)",
        action: _triggerCatboxUpload
    }));
};

var _catboxUploadPlugin = h({
    name: "CatboxUploadButton",
    description: "Bypasses Discord upload limits: adds 'Upload Large File (Catbox)' option to the + attachment menu, uploads files directly (up to 200MB+), and embeds the link.",
    tags: ["Upload", "Utility", "Chat"],
    authors: [m.Ven],
    contextMenus: {
        "channel-attach": _catboxCtxPatch
    }
});`;

// Production implementation of DMArchive plugin
const dmArchiveCode = `function _triggerDmDownload(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 2500);
}

function _escapeHtmlDm(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function _formatTimestampDm(iso) {
    try {
        return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    } catch(e) { return iso; }
}

function _renderMiniMarkdownDm(c) {
    if (!c) return "";
    var codeBlocks = [];
    var res = c.replace(/\`\`\`([a-zA-Z0-9_-]*)\\n?([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
        var idx = codeBlocks.length;
        codeBlocks.push("<pre class=\\"codeblock\\"><code>" + _escapeHtmlDm(code) + "</code></pre>");
        return "@@CB_" + idx + "@@";
    });
    var inlines = [];
    res = res.replace(/\`([^\`]+)\`/g, function(_, code) {
        var idx = inlines.length;
        inlines.push("<code class=\\"inline-code\\">" + _escapeHtmlDm(code) + "</code>");
        return "@@IC_" + idx + "@@";
    });
    res = _escapeHtmlDm(res);
    res = res.replace(/(https?:\\/\\/[^\\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');
    res = res.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g, "<strong><em>$1</em></strong>");
    res = res.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
    res = res.replace(/\\*([^*]+?)\\*/g, "<em>$1</em>");
    res = res.replace(/__(.+?)__/g, "<u>$1</u>");
    res = res.replace(/~~(.+?)~~/g, "<del>$1</del>");
    res = res.replace(/^(&gt;|>)\\s?(.*)$/gm, '<blockquote class="quote">$2</blockquote>');
    res = res.replace(/\\n/g, "<br>");
    inlines.forEach(function(codeHtml, i) { res = res.replace("@@IC_" + i + "@@", codeHtml); });
    codeBlocks.forEach(function(codeHtml, i) { res = res.replace("@@CB_" + i + "@@", codeHtml); });
    return res;
}

function _generateHtmlDocDm(meta, msgs) {
    var isComp = meta.isComplete;
    var chName = _escapeHtmlDm(meta.channel.name);
    var recList = meta.channel.recipients.map(function(r) { return _escapeHtmlDm(r.globalName ? r.globalName + " (@" + r.username + ")" : "@" + r.username); }).join(", ");
    var dateRange = (meta.filter.startDate || meta.filter.endDate) ? ((meta.filter.startDate || "Beginning") + " to " + (meta.filter.endDate || "Latest")) : "Full History";

    var msgsHtml = msgs.map(function(m) {
        var authorDisplay = _escapeHtmlDm(m.author.globalName || m.author.username);
        var authorUser = _escapeHtmlDm(m.author.username);
        var timeStr = _formatTimestampDm(m.timestamp);
        var editedStr = m.editedTimestamp ? '<span class="edited-badge" title="Edited: ' + _formatTimestampDm(m.editedTimestamp) + '">(edited)</span>' : '';
        var contentHtml = _renderMiniMarkdownDm(m.content);
        var attHtml = "";
        if (m.attachments && m.attachments.length) {
            attHtml = '<div class="attachments-list">' + m.attachments.map(function(a) {
                var isImg = (a.contentType && a.contentType.startsWith("image/")) || /\\.(png|jpe?g|webp|gif)$/i.test(a.filename);
                if (isImg) {
                    return '<div class="attachment-item"><a href="' + _escapeHtmlDm(a.url) + '" target="_blank"><img class="attachment-img" src="' + _escapeHtmlDm(a.url) + '" alt="' + _escapeHtmlDm(a.filename) + '" loading="lazy" /></a><div class="attachment-info"><a href="' + _escapeHtmlDm(a.url) + '" target="_blank">' + _escapeHtmlDm(a.filename) + '</a> (' + (a.size ? (a.size/1024).toFixed(1) + ' KB' : '') + ')</div></div>';
                }
                return '<div class="attachment-item"><div class="attachment-file"><span class="file-icon">&#128190;</span><a href="' + _escapeHtmlDm(a.url) + '" target="_blank">' + _escapeHtmlDm(a.filename) + '</a> (' + (a.size ? (a.size/1024).toFixed(1) + ' KB' : '') + ')</div></div>';
            }).join("") + '</div>';
        }
        var embHtml = "";
        if (m.embeds && m.embeds.length) {
            embHtml = '<div class="embeds-list">' + m.embeds.map(function(em) {
                var cBorder = em.color ? '#' + em.color.toString(16).padStart(6, '0') : 'rgba(255,255,255,0.15)';
                var emTitle = em.title ? '<div class="embed-title">' + (em.url ? '<a href="' + _escapeHtmlDm(em.url) + '" target="_blank">' + _escapeHtmlDm(em.title) + '</a>' : _escapeHtmlDm(em.title)) + '</div>' : '';
                var emDesc = em.description ? '<div class="embed-desc">' + _escapeHtmlDm(em.description) + '</div>' : '';
                return '<div class="embed-box" style="border-left-color: ' + cBorder + ';">' + emTitle + emDesc + '</div>';
            }).join("") + '</div>';
        }

        var avatar = m.author.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
        return '<div class="message-row" id="msg-' + m.id + '"><img class="avatar" src="' + _escapeHtmlDm(avatar) + '" alt="" loading="lazy" /><div class="message-body"><div class="message-meta"><span class="author-name">' + authorDisplay + '</span><span class="author-handle">@' + authorUser + '</span><span class="timestamp">' + timeStr + '</span>' + editedStr + '</div>' + (contentHtml ? '<div class="message-text">' + contentHtml + '</div>' : '') + attHtml + embHtml + '</div></div>';
    }).join("\\n");

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DM Archive — ' + chName + '</title><style>:root{--bg-primary:#313338;--bg-secondary:#2b2d31;--bg-tertiary:#1e1f22;--text-normal:#dbdee1;--text-muted:#949ba4;--text-heading:#ffffff;--link-color:#00a8fc;--border-subtle:rgba(255,255,255,0.08);--code-bg:#1e1f22;--success-color:#23a55a;--warning-color:#f0b232}*{box-sizing:border-box;margin:0;padding:0}body{font-family:"gg sans","Noto Sans",sans-serif;background-color:var(--bg-primary);color:var(--text-normal);line-height:1.45;font-size:15px;display:flex;flex-direction:column;min-height:100vh}header.archive-header{background-color:var(--bg-tertiary);border-bottom:1px solid var(--border-subtle);padding:18px 24px}.header-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.header-title-section h1{font-size:20px;font-weight:700;color:var(--text-heading);display:flex;align-items:center;gap:10px}.status-badge{font-size:11px;font-weight:600;padding:4px 9px;border-radius:12px;text-transform:uppercase;letter-spacing:0.5px}.status-badge.complete{background:rgba(35,165,90,0.2);color:var(--success-color);border:1px solid rgba(35,165,90,0.4)}.status-badge.partial{background:rgba(240,178,50,0.2);color:var(--warning-color);border:1px solid rgba(240,178,50,0.4)}.search-container input{background-color:var(--bg-primary);border:1px solid var(--border-subtle);color:var(--text-normal);padding:7px 12px;border-radius:6px;font-size:13px;width:240px;outline:none}.header-meta{margin-top:12px;display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--text-muted)}.header-meta strong{color:var(--text-normal)}.chat-container{flex:1;padding:16px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}.message-row{display:flex;gap:16px;padding:4px 8px;border-radius:6px;transition:background 0.15s}.message-row:hover{background-color:rgba(255,255,255,0.03)}.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0}.message-body{flex:1;min-width:0}.message-meta{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}.author-name{font-weight:600;color:var(--text-heading);font-size:15px}.author-handle{color:var(--text-muted);font-size:12px}.timestamp{color:var(--text-muted);font-size:12px}.edited-badge{color:var(--text-muted);font-size:11px}.message-text{word-break:break-word}.codeblock{background:var(--code-bg);padding:10px;border-radius:6px;margin:6px 0;font-family:monospace;font-size:13px;overflow-x:auto}.inline-code{background:var(--code-bg);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:13px}.quote{border-left:4px solid var(--border-subtle);padding-left:10px;margin:4px 0;color:var(--text-muted)}.chat-link{color:var(--link-color);text-decoration:none}.chat-link:hover{text-decoration:underline}.attachments-list{margin-top:8px;display:flex;flex-direction:column;gap:8px}.attachment-img{max-width:400px;max-height:300px;border-radius:6px}.attachment-file{background:var(--bg-secondary);padding:8px 12px;border-radius:6px;display:inline-flex;align-items:center;gap:8px;font-size:13px}.embed-box{background:var(--bg-secondary);border-left:4px solid;border-radius:4px;padding:10px 14px;margin-top:8px;max-width:520px}.embed-title{font-weight:600;color:var(--text-heading);font-size:14px}.embed-desc{font-size:13px;color:var(--text-normal);margin-top:4px}footer.archive-footer{background-color:var(--bg-tertiary);border-top:1px solid var(--border-subtle);text-align:center;padding:16px;font-size:12px;color:var(--text-muted)}</style></head><body><header class="archive-header"><div class="header-top"><div class="header-title-section"><h1><span>&#128172;</span> ' + chName + ' <span class="status-badge ' + (isComp ? 'complete' : 'partial') + '">' + (isComp ? '&#10003; Complete Archive' : '&#9888; Partial Archive') + '</span></h1></div><div class="search-container"><input type="text" id="transcript-search" placeholder="Filter messages..." oninput="filterMessages(this.value)" /></div></div><div class="header-meta"><span>Recipients: <strong>' + recList + '</strong></span><span>Messages: <strong>' + msgs.length + '</strong></span><span>Date Range: <strong>' + dateRange + '</strong></span><span>Exported: <strong>' + _formatTimestampDm(meta.exportedAt) + '</strong></span><span>Status: <strong>' + _escapeHtmlDm(meta.statusMessage || (isComp ? 'Complete' : 'Partial')) + '</strong></span></div></header>' + (!isComp ? '<div style="background:rgba(240,178,50,0.15);border-left:4px solid var(--warning-color);padding:12px 24px;color:#ffdc7a;font-size:14px;margin:12px 24px 0 24px;border-radius:4px;"><strong>&#9888; Partial Archive:</strong> ' + _escapeHtmlDm(meta.statusMessage || 'This export was interrupted or cancelled.') + '</div>' : '') + '<main class="chat-container">' + msgsHtml + '</main><footer class="archive-footer">Generated locally by Vencord DM Archive Plugin &bull; End-to-End Client Export &bull; No external transmission</footer><script>function filterMessages(q){q=(q||"").toLowerCase();var rows=document.querySelectorAll(".message-row");for(var i=0;i<rows.length;i++){rows[i].style.display=(!q||rows[i].innerText.toLowerCase().indexOf(q)!==-1)?"":"none";}}<\/script></body></html>';
}

function _openDmArchiveModal(channelId) {
    var ch = K.getChannel(channelId);
    if (!ch) {
        se("Could not find DM channel (" + channelId + ")", "failure");
        return;
    }

    var isGroup = Boolean(ch.type === 3 || ch.isGroupDM?.() || (ch.type !== 1 && !ch.isDM?.() && Array.isArray(ch.recipients) && ch.recipients.length > 2));
    var chType = isGroup ? "Group DM" : "Direct Message";
    var currentUserId = k.getCurrentUser()?.id;
    var chRecipients = (ch.recipients || []).map(function(r) {
        var u = (typeof r === "object") ? r : k.getUser(r);
        return {
            id: String(u?.id || r),
            username: u?.username || "User",
            globalName: u?.globalName || u?.global_name,
            avatarUrl: u ? ("https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + ".png?size=64") : ""
        };
    });

    var chName = ch.name || "";
    if (!chName) {
        if (chRecipients.length > 0) {
            var others = currentUserId ? chRecipients.filter(function(u){ return u.id !== currentUserId; }) : chRecipients;
            chName = (others.length ? others : chRecipients).map(function(u){ return u.globalName || u.username; }).join(", ");
        } else {
            chName = "DM (" + channelId + ")";
        }
    }

    var existingModal = document.getElementById("vc-dm-archive-modal-overlay");
    if (existingModal) existingModal.remove();

    var overlay = document.createElement("div");
    overlay.id = "vc-dm-archive-modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;";

    var modal = document.createElement("div");
    modal.style.cssText = "background:rgba(18,22,32,0.95);border:1px solid rgba(255,255,255,0.14);box-shadow:0 16px 40px rgba(0,0,0,0.6);border-radius:12px;width:540px;max-width:100%;color:#fff;display:flex;flex-direction:column;gap:16px;padding:24px;font-family:inherit;box-sizing:border-box;";

    modal.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;"><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#128172;</span><h2 style="font-size:18px;font-weight:600;margin:0;">Export DM Message History</h2></div><button id="vc-dm-close-btn" style="background:transparent;border:none;color:rgba(255,255,255,0.7);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;">&#10005;</button></div><div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;font-size:13px;display:flex;flex-direction:column;gap:4px;"><div><span style="color:rgba(255,255,255,0.6);">Conversation:</span> <strong style="color:#fff;">' + _escapeHtmlDm(chName) + '</strong> (' + chType + ')</div><div><span style="color:rgba(255,255,255,0.6);">Recipients:</span> <span>' + _escapeHtmlDm(chRecipients.map(function(r){ return r.globalName ? r.globalName + " (@" + r.username + ")" : "@" + r.username; }).join(", ")) + '</span></div></div><div style="display:flex;flex-direction:column;gap:12px;font-size:13px;"><label style="display:flex;flex-direction:column;gap:4px;"><span style="color:rgba(255,255,255,0.8);font-weight:500;">Export Format:</span><select id="vc-dm-format" style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px 10px;border-radius:6px;outline:none;"><option value="html" selected>HTML (Visual Interactive Transcript)</option><option value="json">JSON (Structured Data Backup)</option><option value="both">Both (HTML + JSON)</option></select></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><label style="display:flex;flex-direction:column;gap:4px;"><span style="color:rgba(255,255,255,0.8);">Start Date (Optional):</span><input type="date" id="vc-dm-start-date" style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:6px 10px;border-radius:6px;outline:none;" /></label><label style="display:flex;flex-direction:column;gap:4px;"><span style="color:rgba(255,255,255,0.8);">End Date (Optional):</span><input type="date" id="vc-dm-end-date" style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:6px 10px;border-radius:6px;outline:none;" /></label></div><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="vc-dm-include-att" checked style="cursor:pointer;" /><span>Include attachment links and image previews</span></label><label style="display:flex;flex-direction:column;gap:4px;"><span style="color:rgba(255,255,255,0.8);">Custom Output Filename (Optional):</span><input type="text" id="vc-dm-custom-name" placeholder="Leave empty for default timestamped name" style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px 10px;border-radius:6px;outline:none;" /></label></div><div id="vc-dm-progress-box" style="display:none;background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.3);border-radius:8px;padding:12px;font-size:13px;flex-direction:column;gap:6px;"><div id="vc-dm-progress-status" style="font-weight:500;color:#82a5ff;">Preparing history export...</div><div id="vc-dm-progress-rate" style="display:none;color:#f0b232;font-size:12px;">Discord rate limit encountered (429). Retrying...</div></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;"><button id="vc-dm-cancel-btn" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;">Cancel</button><button id="vc-dm-start-btn" style="background:#5865f2;border:none;color:#fff;padding:8px 20px;border-radius:6px;font-weight:600;cursor:pointer;">Start Export</button></div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var isCancelled = false;
    var isExporting = false;

    function closeModal() {
        if (isExporting) isCancelled = true;
        overlay.remove();
    }

    document.getElementById("vc-dm-close-btn").onclick = closeModal;
    document.getElementById("vc-dm-cancel-btn").onclick = function() {
        if (isExporting) {
            isCancelled = true;
            document.getElementById("vc-dm-progress-status").innerText = "Cancelling... generating partial export.";
        } else {
            closeModal();
        }
    };

    document.getElementById("vc-dm-start-btn").onclick = async function() {
        isExporting = true;
        document.getElementById("vc-dm-start-btn").disabled = true;
        document.getElementById("vc-dm-start-btn").style.opacity = "0.5";
        document.getElementById("vc-dm-start-btn").innerText = "Exporting...";
        var pBox = document.getElementById("vc-dm-progress-box");
        var pStatus = document.getElementById("vc-dm-progress-status");
        var pRate = document.getElementById("vc-dm-progress-rate");
        pBox.style.display = "flex";

        var formatVal = document.getElementById("vc-dm-format").value;
        var startDateVal = document.getElementById("vc-dm-start-date").value || null;
        var endDateVal = document.getElementById("vc-dm-end-date").value || null;
        var includeAttVal = document.getElementById("vc-dm-include-att").checked;
        var customNameVal = (document.getElementById("vc-dm-custom-name").value || "").trim();

        var allRaw = [];
        var seenIds = new Set();
        var lastId = null;
        var batchNum = 0;
        var isComp = false;
        var status = "complete";
        var statusMsg = "All accessible messages retrieved.";

        try {
            while (true) {
                if (isCancelled) {
                    status = "cancelled";
                    statusMsg = "Export cancelled by user.";
                    isComp = false;
                    break;
                }

                var q = { limit: 100 };
                if (lastId) q.before = lastId;

                var batch = [];
                try {
                    var res = await nt.get({ url: bt.Endpoints.MESSAGES(channelId), query: q, retries: 2 });
                    pRate.style.display = "none";
                    batch = Array.isArray(res?.body) ? res.body : [];
                } catch (err) {
                    if (err?.status === 429 || err?.body?.retry_after) {
                        var waitMs = Math.ceil((Number(err?.body?.retry_after) || 1.5) * 1000);
                        pRate.style.display = "block";
                        pRate.innerText = "Discord rate limit encountered (429). Retrying in " + (waitMs/1000).toFixed(1) + "s...";
                        await new Promise(function(r) { setTimeout(r, waitMs); });
                        continue;
                    }
                    status = "error";
                    statusMsg = "Fetch error: " + (err?.message || String(err));
                    isComp = false;
                    break;
                }

                if (!batch || !batch.length) {
                    isComp = true;
                    break;
                }

                for (var b = 0; b < batch.length; b++) {
                    var m = batch[b];
                    if (m?.id && !seenIds.has(m.id)) {
                        seenIds.add(m.id);
                        allRaw.push(m);
                    }
                }

                batchNum++;
                pStatus.innerText = "Fetched " + allRaw.length + " messages (Batch " + batchNum + ")...";

                if (batch.length < 100) {
                    isComp = true;
                    break;
                }

                lastId = batch[batch.length - 1].id;
                await new Promise(function(r) { setTimeout(r, 350); });
            }

            var parsedMsgs = allRaw.map(function(raw) {
                var auth = {
                    id: String(raw.author?.id || "0"),
                    username: String(raw.author?.username || "Unknown"),
                    globalName: raw.author?.global_name || undefined,
                    avatarUrl: raw.author?.avatar ? ("https://cdn.discordapp.com/avatars/" + raw.author.id + "/" + raw.author.avatar + ".png?size=64") : "https://cdn.discordapp.com/embed/avatars/0.png"
                };
                var atts = (includeAttVal && Array.isArray(raw.attachments)) ? raw.attachments.map(function(a) {
                    return { id: String(a.id), filename: String(a.filename||"file"), size: Number(a.size||0), url: String(a.url||a.proxy_url||""), contentType: a.content_type };
                }) : [];
                var embs = Array.isArray(raw.embeds) ? raw.embeds.map(function(em) {
                    return { type: em.type, title: em.title, description: em.description, url: em.url, color: em.color };
                }) : [];
                return {
                    id: String(raw.id),
                    channelId: String(raw.channel_id),
                    content: String(raw.content || ""),
                    author: auth,
                    timestamp: String(raw.timestamp || new Date().toISOString()),
                    editedTimestamp: raw.edited_timestamp ? String(raw.edited_timestamp) : null,
                    attachments: atts,
                    embeds: embs
                };
            });

            parsedMsgs.sort(function(a, b) {
                var diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                if (diff !== 0) return diff;
                try { return BigInt(a.id) < BigInt(b.id) ? -1 : 1; } catch(e) { return a.id.localeCompare(b.id); }
            });

            if (startDateVal) {
                var st = new Date(startDateVal).getTime();
                if (!isNaN(st)) parsedMsgs = parsedMsgs.filter(function(m){ return new Date(m.timestamp).getTime() >= st; });
            }
            if (endDateVal) {
                var et = new Date(endDateVal + "T23:59:59.999Z").getTime();
                if (!isNaN(et)) parsedMsgs = parsedMsgs.filter(function(m){ return new Date(m.timestamp).getTime() <= et; });
            }

            var metadata = {
                version: "1.0.0",
                exportedAt: new Date().toISOString(),
                isComplete: isComp,
                status: status,
                statusMessage: statusMsg,
                channel: { id: channelId, name: chName, type: isGroup ? "GROUP_DM" : "DM", recipients: chRecipients },
                filter: { startDate: startDateVal, endDate: endDateVal, includeAttachments: includeAttVal },
                totalMessages: parsedMsgs.length
            };

            var dateSlug = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            var safeName = chName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "dm_archive";
            var baseFilename = customNameVal ? customNameVal.replace(/\\.(html|json)$/i, "") : (safeName + "_" + dateSlug);

            if (formatVal === "html" || formatVal === "both") {
                var htmlDoc = _generateHtmlDocDm(metadata, parsedMsgs);
                _triggerDmDownload(htmlDoc, baseFilename + ".html", "text/html;charset=utf-8");
            }

            if (formatVal === "json" || formatVal === "both") {
                var jsonDoc = JSON.stringify({ metadata: metadata, messages: parsedMsgs }, null, 2);
                _triggerDmDownload(jsonDoc, baseFilename + ".json", "application/json;charset=utf-8");
            }

            se("DM Export complete: " + parsedMsgs.length + " messages saved (" + (isComp ? "Complete" : "Partial") + ")", isComp ? "success" : "info");
            setTimeout(closeModal, 1200);
        } catch (fatalErr) {
            console.error("[DMArchive] Export failed:", fatalErr);
            se("Export failed: " + (fatalErr.message || String(fatalErr)), "failure");
            document.getElementById("vc-dm-start-btn").disabled = false;
            document.getElementById("vc-dm-start-btn").style.opacity = "1";
            document.getElementById("vc-dm-start-btn").innerText = "Start Export";
        }
    };
}

window.openDmArchiveModal = _openDmArchiveModal;
window.openDmArchiveModalForUser = function(userId) {
    var dmChId = K.getDMFromUserId(userId);
    if (dmChId) {
        _openDmArchiveModal(dmChId);
    } else {
        se("No open DM channel found for user. Open a direct message first.", "info");
    }
};

var _dmArchiveCtxPatch = function(e, t) {
    var ch = t?.channel;
    if (!ch) return;
    var isDM = Boolean(ch.type === 1 || ch.type === 3 || ch.isDM?.() || ch.isGroupDM?.());
    if (!isDM) return;
    e.push(r(I.MenuItem, {
        id: "vc-export-dm-history",
        iconLeft: so,
        leadingAccessory: { type: "icon", icon: so },
        label: ch.type === 3 || ch.isGroupDM?.() ? "Export Group DM History" : "Export DM History",
        action: function() { _openDmArchiveModal(ch.id); }
    }));
};

var _dmArchiveUserCtxPatch = function(e, t) {
    var u = t?.user;
    if (!u) return;
    e.push(r(I.MenuItem, {
        id: "vc-export-user-dm-history",
        iconLeft: so,
        leadingAccessory: { type: "icon", icon: so },
        label: "Export DM History",
        action: function() { window.openDmArchiveModalForUser(u.id); }
    }));
};

var _dmArchivePlugin = h({
    name: "DMArchive",
    description: "Export message history of individual Discord DMs or Group DMs to styled standalone HTML transcripts and structured JSON backups.",
    tags: ["Chat", "Utility", "Messages", "Backup"],
    authors: [m.Ven],
    contextMenus: {
        "channel-context": _dmArchiveCtxPatch,
        "gdm-context": _dmArchiveCtxPatch,
        "user-context": _dmArchiveUserCtxPatch
    }
});`;

// Glass Theme Search Bar Component
const modernSearchL4 = `function l4(){let e=De(["enabledThemes"]),t=Ue(null),[o,n]=C(null),[q,sq]=C("");Z(()=>{i()},[]);async function i(){let s=await VencordNative.themes.getThemesList();n(s)}let filt=o?.filter(s=>{if(!q)return true;let lk=q.toLowerCase().trim();if(!lk)return true;let terms=lk.split(/\\s+/);return terms.every(term=>(s.name&&s.name.toLowerCase().includes(term))||(s.fileName&&s.fileName.toLowerCase().includes(term))||(s.description&&s.description.toLowerCase().includes(term))||(s.author&&s.author.toLowerCase().includes(term)))});return r(X,{flexDirection:"column",gap:"1em"},r(Ae,null,r(A.FormTitle,{tag:"h5"},"Find Themes:"),r(X,{gap:"0.4em",flexDirection:"column",justifyContent:"flex-start",className:D.bottom8},r("span",null,"\\u2013 ",r($e,{href:"https://betterdiscord.app/themes"},"BetterDiscord theme list")),r("span",null,"\\u2013 ",r($e,{href:"https://github.com/search?q=discord+theme"},"GitHub"))),r(A.FormText,null,"If using the BD site, click on Download and place the downloaded .theme.css file into your themes folder.")),r(Ae,null,r(A.FormTitle,{tag:"h5"},"External Resources"),r(A.FormText,null,"For security reasons, loading resources from most sites is blocked."),r(A.FormText,null,"Make sure all your assets are hosted on GitHub, GitLab, Codeberg, Imgur, Discord or Google Fonts.")),r("section",null,r(A.FormTitle,{tag:"h5"},"Local Themes"),r(ou,null,r(p,null,r(vr,{text:"Open Themes Folder",action:()=>VencordNative.themes.openFolder(),Icon:mc}),r(vr,{text:"Load missing Themes",action:i,Icon:ts}),r(vr,{text:"Edit QuickCSS",action:()=>VencordNative.quickCss.openEditor(),Icon:os}),xe(xs.name)&&r(vr,{text:"Edit ClientTheme",action:()=>gr(xs),Icon:fc})))),r("div",{className:"vc-theme-search-container "+D.top16},r("div",{className:"vc-theme-search-bar"},r("svg",{className:"vc-theme-search-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},r("circle",{cx:"11",cy:"11",r:"8"}),r("line",{x1:"21",y1:"21",x2:"16.65",y2:"16.65"})),r("input",{type:"text",className:"vc-theme-search-input",placeholder:"Search 83+ themes by name, author, or keyword...",value:q,onChange:v=>sq(v.target.value),autoFocus:!1,spellCheck:!1}),q?r("button",{type:"button",className:"vc-theme-search-clear",onClick:()=>sq(""),title:"Clear search"},"\\u2715"):null,o?r("div",{className:"vc-theme-search-badge"},filt?(filt.length+" / "+o.length):""):null)),filt?.length?r("div",{className:H8("grid")},filt.map(s=>r(s4,{key:s.fileName,enabled:e.enabledThemes.includes(s.fileName),onChange:l=>{a4(s.fileName,l);if(typeof _syncActiveThemeClass==="function")setTimeout(_syncActiveThemeClass,30);},onDelete:async()=>{a4(s.fileName,!1);await VencordNative.themes.deleteTheme(s.fileName);if(typeof _syncActiveThemeClass==="function")setTimeout(_syncActiveThemeClass,30);i()},theme:s}))):r(z,{className:D.top16},q?"No themes found matching \\""+q+"\\". Try searching for another name, anime, or author.":"No themes found in your themes folder."))}`;

const themeClassSyncCode = `function _syncActiveThemeClass(themesList) {
    try {
        var hasTheme = false;
        if (Array.isArray(themesList)) {
            hasTheme = themesList.length > 0;
        } else if (typeof window !== "undefined" && window.Vencord && window.Vencord.Settings) {
            var s = window.Vencord.Settings;
            hasTheme = Boolean((s.enabledThemes && s.enabledThemes.length > 0) || (s.themeLinks && s.themeLinks.length > 0));
        } else if (typeof document !== "undefined") {
            var el = document.getElementById("vencord-themes");
            if (el && el.textContent) {
                var txt = el.textContent.trim();
                hasTheme = Boolean(txt && (txt.includes("@import") || txt.includes("url(") || txt.includes(".theme.css") || txt.includes("vencord:///themes/")));
            }
            if (!hasTheme) {
                var themeTags = document.querySelectorAll('style[id^="vencord-theme-"], link[href*=".theme.css"]');
                hasTheme = Boolean(themeTags && themeTags.length > 0);
            }
        }
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.toggle("vc-has-active-theme", Boolean(hasTheme));
        }
    } catch (e) {}
}
if (typeof document !== "undefined") {
    _syncActiveThemeClass();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() { _syncActiveThemeClass(); });
    }
}
`;

// Process renderer.js files
for (const rPath of rendererPaths) {
    if (!fs.existsSync(rPath)) continue;
    let content = fs.readFileSync(rPath, "utf8");

    // Inject active theme synchronizer
    if (!content.includes("function _syncActiveThemeClass")) {
        content = themeClassSyncCode + "\n" + content;
        console.log(`[inject] Injected _syncActiveThemeClass in ${rPath}`);
    } else {
        // Update existing definition
        const fnStart = content.indexOf("function _syncActiveThemeClass(");
        const fnEnd = content.indexOf("\n\n// Vencord 16ec4ea");
        if (fnStart !== -1 && fnEnd !== -1) {
            content = themeClassSyncCode.trim() + content.substring(fnEnd);
            console.log(`[inject] Refreshed _syncActiveThemeClass in ${rPath}`);
        }
    }

    // Patch Ea() to update vc-has-active-theme class
    const eaMarker = "xw.textContent=i.map(s=>`@import url(\"${s.trim()}\");`).join(`\n`),";
    if (content.includes(eaMarker) && !content.includes("_syncActiveThemeClass(i)")) {
        content = content.replace(eaMarker, eaMarker + "_syncActiveThemeClass(i),");
        console.log(`[inject] Hooked _syncActiveThemeClass into Ea() in ${rPath}`);
    }

    // Replace or inject SplitLargeMessages & CatboxUploadButton
    if (content.includes("var _splitPending = new Map()")) {
        const start = content.indexOf("var _splitPending = new Map()");
        const end = content.indexOf("function _triggerCatboxUpload()");
        if (start !== -1 && end !== -1) {
            content = content.substring(0, start) + splitPluginCode + "\n\n" + content.substring(end);
            console.log(`[inject] Replaced legacy split plugin with robust SplitLargeMessages in ${rPath}`);
        }
    } else if (!content.includes('name:"SplitLargeMessages"')) {
        const marker = 'F2={waveform:"AAAAAAAAAAAA",duration:1};';
        if (content.includes(marker)) {
            content = content.replace(marker, marker + "\n" + splitPluginCode + "\n\n" + catboxCode + "\n");
            content = content.replace(',[Mh.name]:Mh,', ',[Mh.name]:Mh,[_splitLargeMessagesPlugin.name]:_splitLargeMessagesPlugin,[_catboxUploadPlugin.name]:_catboxUploadPlugin,');
            content = content.replace('[Mh.name]:{folderName:"voiceMessages",userPlugin:!1},', '[Mh.name]:{folderName:"voiceMessages",userPlugin:!1},[_splitLargeMessagesPlugin.name]:{folderName:"splitLargeMessages",userPlugin:!1},[_catboxUploadPlugin.name]:{folderName:"catboxUploadButton",userPlugin:!1},');
            console.log(`[inject] Injected plugins in ${rPath}`);
        }
    }

    // Inject or update DMArchive plugin
    if (content.includes('name: "DMArchive"') || content.includes('name:"DMArchive"')) {
        const dmStart = content.indexOf("function _triggerDmDownload(");
        const dmEnd = content.indexOf('"user-context": _dmArchiveUserCtxPatch\\n    }\\n});', dmStart);
        if (dmStart !== -1 && dmEnd !== -1) {
            const cutEnd = dmEnd + '"user-context": _dmArchiveUserCtxPatch\\n    }\\n});'.length;
            content = content.substring(0, dmStart) + dmArchiveCode + content.substring(cutEnd);
            console.log(`[inject] Refreshed DMArchive plugin code in ${rPath}`);
        }
    } else {
        const catboxEnd = content.indexOf('var _catboxUploadPlugin = h({');
        if (catboxEnd !== -1) {
            const pluginEnd = content.indexOf('});', catboxEnd);
            if (pluginEnd !== -1) {
                content = content.substring(0, pluginEnd + 3) + "\n\n" + dmArchiveCode + content.substring(pluginEnd + 3);
                content = content.replaceAll('[_catboxUploadPlugin.name]:_catboxUploadPlugin,', '[_catboxUploadPlugin.name]:_catboxUploadPlugin,[_dmArchivePlugin.name]:_dmArchivePlugin,');
                content = content.replaceAll('[_catboxUploadPlugin.name]:{folderName:"catboxUploadButton",userPlugin:!1},', '[_catboxUploadPlugin.name]:{folderName:"catboxUploadButton",userPlugin:!1},[_dmArchivePlugin.name]:{folderName:"dmArchive",userPlugin:!1},');
                console.log(`[inject] Injected DMArchive plugin into ${rPath}`);
            }
        }
    }

    // Replace l4() theme search bar
    const l4Start = content.indexOf("function l4(){");
    const l4End = content.indexOf("}a();b();function c4(){", l4Start);
    if (l4Start !== -1 && l4End !== -1) {
        content = content.substring(0, l4Start) + modernSearchL4 + content.substring(l4End + 1);
        console.log(`[inject] Updated theme search bar component in ${rPath}`);
    }

    fs.writeFileSync(rPath, content, "utf8");
}

// Full Glass UI Transparency and Modern Theme Search Bar CSS
// IMPORTANT: All layout transparency rules are strictly scoped to html.vc-has-active-theme
// so that when NO theme is selected, Discord looks completely normal and vanilla.
const glassCss = `
/* =======================================================================
   Complete Glass Transparency & Modern UI Enhancement
   (Scoped to active themes only - vanilla Discord remains untouched)
   ======================================================================= */

/* Root window transparency */
html.vc-has-active-theme,
html.vc-has-active-theme body,
html.vc-has-active-theme #app-mount,
html.vc-has-active-theme .app_de4237,
html.vc-has-active-theme .app__160d8,
html.vc-has-active-theme .appMount_ea7e65,
html.vc-has-active-theme .app_a0120,
html.vc-has-active-theme .bg__960e4,
html.vc-has-active-theme .bg_d4b6c5,
html.vc-has-active-theme .layers__160d8,
html.vc-has-active-theme .layers_a0120,
html.vc-has-active-theme .layers__960e4,
html.vc-has-active-theme .layer__960e4,
html.vc-has-active-theme .container__5c7e7 {
    background: transparent !important;
    background-color: transparent !important;
}

/* Discord native voice & call variables override */
html.vc-has-active-theme {
    --voice-video-background: transparent !important;
    --voice-video-tile-background: rgba(0, 0, 0, 0.35) !important;
    --voice-video-tile-blur-fallback: rgba(0, 0, 0, 0.35) !important;
    --voice-channel-background: transparent !important;
    --voice-grid-background: transparent !important;
    --voice-call-background: transparent !important;
    --call-background: transparent !important;
    --voice-empty-state-background: transparent !important;
}

/* Server icon sidebar */
html.vc-has-active-theme .guilds__5e434,
html.vc-has-active-theme .wrapper_ef3116,
html.vc-has-active-theme [class*="guilds_"],
html.vc-has-active-theme [class*="tree_"],
html.vc-has-active-theme [class*="scroller_"][class*="guilds"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Channel list sidebar and category headers */
html.vc-has-active-theme .sidebar_c48ade,
html.vc-has-active-theme .sidebar__5e434,
html.vc-has-active-theme [class*="sidebar_"]:not([class*="sidebarContainer_"]),
html.vc-has-active-theme .container__ee69e,
html.vc-has-active-theme .container__2637a,
html.vc-has-active-theme .channels__9a337,
html.vc-has-active-theme [class*="channels_"],
html.vc-has-active-theme [class*="sidebarList_"] {
    background: transparent !important;
    background-color: transparent !important;
}

html.vc-has-active-theme [class*="sidebar_"] [class*="scroller_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="containerDefault_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="categoryItem_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="category_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="wrapper_"][class*="category"],
html.vc-has-active-theme [class*="sidebar_"] [class*="name_"][class*="category"],
html.vc-has-active-theme [class*="sidebar_"] [class*="wrapper_"][class*="channel"],
html.vc-has-active-theme [class*="sidebar_"] [class*="link_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="mainContent_"],
html.vc-has-active-theme [class*="sidebar_"] [class*="channel_"] {
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

/* Main chat and message area */
html.vc-has-active-theme .chat_f75fb0,
html.vc-has-active-theme .chat__52833,
html.vc-has-active-theme [class*="chat_"]:not([class*="chatSidebar"]),
html.vc-has-active-theme .chatContent_f75fb0,
html.vc-has-active-theme .chatContent__52833,
html.vc-has-active-theme [class*="chatContent_"],
html.vc-has-active-theme [class*="messagesWrapper_"],
html.vc-has-active-theme [class*="scroller_"][class*="messages"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Member list sidebar */
html.vc-has-active-theme [class*="membersWrap_"],
html.vc-has-active-theme [class*="members_"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Voice Call, Stage, Video Grid, Voice Screen & Lobby Containers (Connected & Disconnected) */
html.vc-has-active-theme .callContainer_cb9592,
html.vc-has-active-theme .callContainer__37e49,
html.vc-has-active-theme .callContainer_d880dc,
html.vc-has-active-theme [class*="callContainer_"],
html.vc-has-active-theme [class*="callContainer"],
html.vc-has-active-theme [class*="callContainer"] [class*="root_"],
html.vc-has-active-theme [class*="callContainer"] > div,
html.vc-has-active-theme [class*="callContainer"] [class*="wrapper_"],
html.vc-has-active-theme [class*="callContainer"] [class*="center_"],
html.vc-has-active-theme [class*="callContainer"] [class*="container_"],
html.vc-has-active-theme [class*="callContainer"] [class*="scroller_"],
html.vc-has-active-theme [class*="callContainer"] [class*="scrollerBase_"],
html.vc-has-active-theme [class*="callContainer"] [class*="idle_"],
html.vc-has-active-theme [class*="callContainer"] [class*="overlay_"],
html.vc-has-active-theme [class*="callContainer"] [class*="gradientContainer"],
html.vc-has-active-theme [class*="callContainer"] [class*="gradientContainer_"],
html.vc-has-active-theme [class*="callContainer"] [class*="pulseGradient_"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoBackground"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoBackground_"],
html.vc-has-active-theme [class*="callContainer"] [class*="video_"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoGrid"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoGrid_"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoWrapper"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoWrapper_"],
html.vc-has-active-theme [class*="callContainer"] canvas,
html.vc-has-active-theme [class*="wrapper_"][class*="video_"],
html.vc-has-active-theme [class*="videoGridWrapper"],
html.vc-has-active-theme [class*="videoGrid_"],
html.vc-has-active-theme [class*="videoGrid"],
html.vc-has-active-theme [class*="videoWrapper_"],
html.vc-has-active-theme [class*="videoWrapper"],
html.vc-has-active-theme [class*="overviewContainer_"],
html.vc-has-active-theme [class*="overviewContainer"],
html.vc-has-active-theme [class*="overviewContainerNoVideo"],
html.vc-has-active-theme [class*="overviewContainerWithVideo"],
html.vc-has-active-theme [class*="stageSection_"],
html.vc-has-active-theme [class*="stageSection"],
html.vc-has-active-theme [class*="stageContainer_"],
html.vc-has-active-theme [class*="stageContainer"],
html.vc-has-active-theme [class*="scrollerBase_"]:has([class*="videoGrid"]),
html.vc-has-active-theme [class*="scroller_"][class*="camera_"],
html.vc-has-active-theme [class*="container_"]:has([class*="callContainer"]),
html.vc-has-active-theme [class*="chat_"]:has([class*="callContainer"]),
html.vc-has-active-theme [class*="channelChatWrapper_"],
html.vc-has-active-theme [class*="chatContent_"]:has([class*="callContainer"]),
html.vc-has-active-theme [class*="chat_"]:has([class*="video_"]),
html.vc-has-active-theme [class*="chatContent_"]:has([class*="video_"]),
html.vc-has-active-theme [class*="chat_"]:has([class*="videoGrid"]),
html.vc-has-active-theme [class*="chatContent_"]:has([class*="videoGrid"]),
html.vc-has-active-theme [class*="wrapper_"]:has([class*="voiceChannel_"]),
html.vc-has-active-theme [class*="container_"]:has([class*="voiceChannel_"]),
html.vc-has-active-theme [class*="chat_"]:has([class*="voiceChannel_"]),
html.vc-has-active-theme [class*="chatContent_"]:has([class*="voiceChannel_"]),
html.vc-has-active-theme [class*="voiceChannel_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="wrapper_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="container_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="content_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="card_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="body_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="inner_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="center_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="scroller_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="lobby_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="panel_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="previewWrapper_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="preview_"],
html.vc-has-active-theme [class*="voiceChannelCard_"],
html.vc-has-active-theme [class*="voiceCard_"],
html.vc-has-active-theme [class*="previewWrapper_"],
html.vc-has-active-theme [class*="previewContainer_"],
html.vc-has-active-theme [class*="voiceChannelEffectsContainer_"],
html.vc-has-active-theme [class*="voiceChannelEffectsContainer"],
html.vc-has-active-theme [class*="voiceUsers_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="scroller_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="content_"],
html.vc-has-active-theme [class*="voiceUsersList_"],
html.vc-has-active-theme [class*="voiceUserList_"],
html.vc-has-active-theme [class*="channelBottomBarArea"],
html.vc-has-active-theme [class*="channelBottomBarArea_"],
html.vc-has-active-theme [class*="channelBottomBarArea_"] [class*="container_"],
html.vc-has-active-theme [class*="channelBottomBarArea_"] [class*="wrapper_"],
html.vc-has-active-theme [class*="stageSection"],
html.vc-has-active-theme [class*="stageSection_"],
html.vc-has-active-theme [class*="stageContainer"],
html.vc-has-active-theme [class*="stageContainer_"],
html.vc-has-active-theme [class*="stagePrompt_"],
html.vc-has-active-theme [class*="stageCard_"],
html.vc-has-active-theme [class*="stageParticipant_"],
html.vc-has-active-theme [class*="prompt_"][class*="stage_"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* Annihilate solid dark navy/purple/black gradient overlays that block wallpaper in voice calls and voice channels */
html.vc-has-active-theme [class*="pulseGradient"],
html.vc-has-active-theme [class*="pulseGradient_"],
html.vc-has-active-theme .pulseGradient__11664,
html.vc-has-active-theme [class*="gradientContainer"],
html.vc-has-active-theme [class*="gradientContainer_"],
html.vc-has-active-theme [class*="videoBackground"],
html.vc-has-active-theme [class*="videoBackground_"],
html.vc-has-active-theme [class*="gradient_"]:not([class*="banner"]):not([class*="badge"]),
html.vc-has-active-theme [class*="idle_"] [class*="gradient_"],
html.vc-has-active-theme [class*="callContainer"] [class*="gradientContainer"],
html.vc-has-active-theme [class*="callContainer"] [class*="pulseGradient"],
html.vc-has-active-theme [class*="voiceChannel"] [class*="gradientContainer"],
html.vc-has-active-theme [class*="voiceChannel"] [class*="pulseGradient"] {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
}

html.vc-has-active-theme [class*="gradientContainer"],
html.vc-has-active-theme [class*="gradientContainer_"],
html.vc-has-active-theme [class*="pulseGradient_"],
html.vc-has-active-theme .pulseGradient__11664,
html.vc-has-active-theme [class*="background_"][class*="video_"],
html.vc-has-active-theme [class*="idle"][class*="gradientContainer"],
html.vc-has-active-theme [class*="idle_"][class*="gradientContainer_"],
html.vc-has-active-theme [class*="callContainer"] [class*="gradientContainer"],
html.vc-has-active-theme [class*="callContainer"] [class*="idle_"],
html.vc-has-active-theme [class*="callContainer"] canvas,
html.vc-has-active-theme [class*="callContainer"] [class*="videoBackground"],
html.vc-has-active-theme [class*="callContainer"] [class*="videoBackground_"],
html.vc-has-active-theme [class*="callContainer"] [class*="background_"]:not([class*="tile"]):not([class*="user"]):not([class*="avatar"]),
html.vc-has-active-theme [class*="voiceChannel"] [class*="gradientContainer"],
html.vc-has-active-theme [class*="voiceChannel"] [class*="background_"],
html.vc-has-active-theme [class*="voiceChannel"] canvas {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* User Boxes / Participant Tiles (Connected & in Voice Views) */
html.vc-has-active-theme [class*="callContainer"] [class*="tile_"],
html.vc-has-active-theme [class*="callContainer"] [class*="tileChild_"],
html.vc-has-active-theme [class*="videoGrid"] [class*="tile_"],
html.vc-has-active-theme [class*="videoGrid_"] [class*="tile_"],
html.vc-has-active-theme [class*="tile_"]:not([class*="emoji"]):not([class*="sticker"]):not([class*="reaction"]):not([class*="item"]):not([class*="icon"]),
html.vc-has-active-theme [class*="tileChild_"],
html.vc-has-active-theme [class*="tileInner_"],
html.vc-has-active-theme [class*="userTile_"],
html.vc-has-active-theme [class*="videoTile_"],
html.vc-has-active-theme [class*="tile__72090"],
html.vc-has-active-theme [data-selenium-video-tile],
html.vc-has-active-theme [class*="root_"][class*="tile_"],
html.vc-has-active-theme [class*="flex_"][class*="tile_"],
html.vc-has-active-theme [class*="speaking_"],
html.vc-has-active-theme [class*="voiceUser_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="user_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="tile_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="userTile_"],
html.vc-has-active-theme [class*="voiceUsers_"] [class*="card_"],
html.vc-has-active-theme [class*="participant_"],
html.vc-has-active-theme [class*="participantTile_"],
html.vc-has-active-theme [class*="participantCard_"] {
    background: rgba(0, 0, 0, 0.35) !important;
    background-color: rgba(0, 0, 0, 0.35) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
}

/* Clear solid opaque inner backgrounds inside user boxes / tiles so glass shows through */
html.vc-has-active-theme [class*="tile_"] [class*="background_"],
html.vc-has-active-theme [class*="tileChild_"] [class*="background_"],
html.vc-has-active-theme [class*="tileInner_"] [class*="background_"],
html.vc-has-active-theme [class*="userTile_"] [class*="background_"],
html.vc-has-active-theme [class*="videoTile_"] [class*="background_"],
html.vc-has-active-theme [class*="tileChild_"] > div:not([class*="overlay_"]):not([class*="indicators_"]):not([class*="status_"]):not([class*="avatar_"]):not([class*="avatarWrapper_"]),
html.vc-has-active-theme [class*="videoGrid_"] [class*="background_"],
html.vc-has-active-theme [class*="videoWrapper_"] [class*="background_"],
html.vc-has-active-theme [class*="callContainer"] [class*="tile_"] [class*="background_"],
html.vc-has-active-theme [class*="callContainer"] [class*="background_"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* Translucent glass for voice channel lobby / preview card / stage card when not connected */
html.vc-has-active-theme [class*="voiceChannel_"] [class*="card_"],
html.vc-has-active-theme [class*="voiceChannel_"] [class*="emptyState_"],
html.vc-has-active-theme [class*="voiceChannelCard_"],
html.vc-has-active-theme [class*="voiceCard_"],
html.vc-has-active-theme [class*="stageCard_"],
html.vc-has-active-theme [class*="stagePrompt_"] {
    background: rgba(0, 0, 0, 0.3) !important;
    background-color: rgba(0, 0, 0, 0.3) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 12px !important;
}

/* Top navigation, title bar, and channel headers */
html.vc-has-active-theme .title_c38106,
html.vc-has-active-theme .title_f75fb0,
html.vc-has-active-theme [class*="title_"][class*="container_"],
html.vc-has-active-theme .subtitleContainer_f75fb0,
html.vc-has-active-theme [class*="subtitleContainer_"],
html.vc-has-active-theme [class*="headerBar_"]:not([class*="shop"]),
html.vc-has-active-theme section[class*="title_"] {
    background: rgba(0, 0, 0, 0.22) !important;
    background-color: rgba(0, 0, 0, 0.22) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

/* Bottom user profile and voice-control panel */
html.vc-has-active-theme .panels__5e434,
html.vc-has-active-theme [class*="panels_"],
html.vc-has-active-theme section[class*="panels_"] {
    background: rgba(0, 0, 0, 0.28) !important;
    background-color: rgba(0, 0, 0, 0.28) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

html.vc-has-active-theme .panels__5e434 .flex__7c0ba .button__67645,
html.vc-has-active-theme .panels__5e434 .actionButtons_e131a9,
html.vc-has-active-theme .panels__5e434 [class*="button_"] {
    background-color: transparent !important;
}

html.vc-has-active-theme .panels__5e434 [class*="button_"]:hover,
html.vc-has-active-theme .panels__5e434 [class*="avatarWrapper_"]:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
}

/* Voice call bottom controls, floating action bars, and active voice connection panel */
html.vc-has-active-theme [class*="bottomControls"],
html.vc-has-active-theme [class*="bottomControls_"],
html.vc-has-active-theme [class*="videoControls"],
html.vc-has-active-theme [class*="videoControls_"],
html.vc-has-active-theme [class*="controlSection"],
html.vc-has-active-theme [class*="controlSection_"],
html.vc-has-active-theme [class*="actionButtons_"],
html.vc-has-active-theme [class*="connection_"],
html.vc-has-active-theme [class*="container_"]:has([class*="connection_"]) {
    background: transparent !important;
    background-color: transparent !important;
}

/* Supported dropdowns, context menus, and popouts */
html.vc-has-active-theme .menu__44b0c,
html.vc-has-active-theme [class*="menu_"][role="menu"],
html.vc-has-active-theme .popout_a16aea,
html.vc-has-active-theme [class*="popout_"]:not([class*="messagePopover"]),
html.vc-has-active-theme [class*="messagesPopoutWrap_"],
html.vc-has-active-theme [class*="recentMentionsPopout_"],
html.vc-has-active-theme [class*="quickswitcher_"] {
    background: rgba(18, 20, 26, 0.8) !important;
    background-color: rgba(18, 20, 26, 0.8) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
    border-radius: 8px !important;
}

html.vc-has-active-theme [class*="menu_"] [class*="item_"]:hover,
html.vc-has-active-theme [class*="menu_"] [class*="item_"][class*="focused_"] {
    background-color: rgba(255, 255, 255, 0.12) !important;
}

/* Chat text input bar glass style */
html.vc-has-active-theme [class*="channelTextArea_"] {
    background: rgba(0, 0, 0, 0.35) !important;
    background-color: rgba(0, 0, 0, 0.35) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
}


/* =======================================================================
   Modern Glass Theme Search Bar
   ======================================================================= */
.vc-theme-search-container {
    width: 100%;
    margin-top: 14px;
    margin-bottom: 14px;
}

.vc-theme-search-bar {
    position: relative;
    display: flex;
    align-items: center;
    background: rgba(15, 18, 24, 0.72) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    border-radius: 10px !important;
    padding: 4px 14px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.vc-theme-search-bar:focus-within {
    border-color: rgba(130, 165, 255, 0.7) !important;
    box-shadow: 0 0 16px rgba(114, 137, 218, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.12) !important;
    background: rgba(18, 22, 32, 0.88) !important;
}

.vc-theme-search-icon {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.65) !important;
    margin-right: 10px;
    flex-shrink: 0;
}

.vc-theme-search-input {
    flex: 1 1 auto;
    background: transparent !important;
    border: none !important;
    color: #ffffff !important;
    font-size: 14px !important;
    line-height: 22px !important;
    padding: 8px 0 !important;
    outline: none !important;
    box-shadow: none !important;
    width: 100%;
}

.vc-theme-search-input::placeholder {
    color: rgba(255, 255, 255, 0.48) !important;
}

.vc-theme-search-clear {
    background: rgba(255, 255, 255, 0.12) !important;
    border: none !important;
    border-radius: 50% !important;
    color: rgba(255, 255, 255, 0.75) !important;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    margin-left: 8px;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
}

.vc-theme-search-clear:hover {
    background: rgba(255, 255, 255, 0.3) !important;
    color: #ffffff !important;
}

.vc-theme-search-badge {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 3px 9px;
    border-radius: 12px;
    margin-left: 10px;
    white-space: nowrap;
    flex-shrink: 0;
}
`;

for (const cPath of cssPaths) {
    if (!fs.existsSync(cPath)) continue;
    let cssContent = fs.readFileSync(cPath, "utf8");
    if (!cssContent.includes(".vc-theme-search-container")) {
        cssContent += "\n" + glassCss;
        fs.writeFileSync(cPath, cssContent, "utf8");
        console.log(`[inject] Appended glass & search styling to ${cPath}`);
    } else {
        // Update existing glass styling block
        const marker = "/* =======================================================================\n   Complete Glass Transparency & Modern UI Enhancement";
        const idx = cssContent.indexOf(marker);
        if (idx !== -1) {
            cssContent = cssContent.substring(0, idx).trimEnd() + "\n\n" + glassCss;
            fs.writeFileSync(cPath, cssContent, "utf8");
            console.log(`[inject] Refreshed glass & search styling in ${cPath}`);
        }
    }
}

// Complete Voice Channel, Stage & Video Call Transparency & Theming block for all 83 themes
const themeVoiceSectionCss = `/* =======================================================================
   Complete Voice Channel, Stage & Video Call Transparency & Theming
   ======================================================================= */
/* Discord native voice & call variables override */
:root,
.theme-dark,
.theme-light,
#app-mount {
    --voice-video-background: transparent !important;
    --voice-video-tile-background: rgba(0, 0, 0, 0.35) !important;
    --voice-video-tile-blur-fallback: rgba(0, 0, 0, 0.35) !important;
    --voice-channel-background: transparent !important;
    --voice-grid-background: transparent !important;
    --voice-call-background: transparent !important;
    --call-background: transparent !important;
    --voice-empty-state-background: transparent !important;
}

/* Server side panel channels and categories - completely transparent, no glassy effect box beside/around their names */
#app-mount [class*="sidebar_"] [class*="containerDefault_"],
#app-mount [class*="sidebar_"] [class*="categoryItem_"],
#app-mount [class*="sidebar_"] [class*="category_"],
#app-mount [class*="sidebar_"] [class*="wrapper_"][class*="category"],
#app-mount [class*="sidebar_"] [class*="name_"][class*="category"],
#app-mount [class*="sidebar_"] [class*="wrapper_"][class*="channel"],
#app-mount [class*="sidebar_"] [class*="link_"],
#app-mount [class*="sidebar_"] [class*="mainContent_"],
#app-mount [class*="sidebar_"] [class*="channel_"] {
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

/* 1. Main Call, Video Grid, Stage, Voice Screen & Lobby Containers (Connected & Disconnected) */
#app-mount .callContainer_cb9592,
#app-mount .callContainer__37e49,
#app-mount .callContainer_d880dc,
#app-mount [class*="callContainer_"],
#app-mount [class*="callContainer"],
#app-mount [class*="callContainer"] [class*="root_"],
#app-mount [class*="callContainer"] > div,
#app-mount [class*="callContainer"] [class*="wrapper_"],
#app-mount [class*="callContainer"] [class*="center_"],
#app-mount [class*="callContainer"] [class*="container_"],
#app-mount [class*="callContainer"] [class*="scroller_"],
#app-mount [class*="callContainer"] [class*="scrollerBase_"],
#app-mount [class*="callContainer"] [class*="idle_"],
#app-mount [class*="callContainer"] [class*="overlay_"],
#app-mount [class*="callContainer"] [class*="gradientContainer"],
#app-mount [class*="callContainer"] [class*="gradientContainer_"],
#app-mount [class*="callContainer"] [class*="pulseGradient_"],
#app-mount [class*="callContainer"] [class*="videoBackground"],
#app-mount [class*="callContainer"] [class*="videoBackground_"],
#app-mount [class*="callContainer"] [class*="video_"],
#app-mount [class*="callContainer"] [class*="videoGrid"],
#app-mount [class*="callContainer"] [class*="videoGrid_"],
#app-mount [class*="callContainer"] [class*="videoWrapper"],
#app-mount [class*="callContainer"] [class*="videoWrapper_"],
#app-mount [class*="callContainer"] canvas,
#app-mount [class*="wrapper_"][class*="video_"],
#app-mount [class*="videoGridWrapper"],
#app-mount [class*="videoGrid_"],
#app-mount [class*="videoGrid"],
#app-mount [class*="videoWrapper_"],
#app-mount [class*="videoWrapper"],
#app-mount [class*="overviewContainer_"],
#app-mount [class*="overviewContainer"],
#app-mount [class*="overviewContainerNoVideo"],
#app-mount [class*="overviewContainerWithVideo"],
#app-mount [class*="stageSection_"],
#app-mount [class*="stageSection"],
#app-mount [class*="stageContainer_"],
#app-mount [class*="stageContainer"],
#app-mount [class*="scrollerBase_"]:has([class*="videoGrid"]),
#app-mount [class*="scroller_"][class*="camera_"],
#app-mount [class*="container_"]:has([class*="callContainer"]),
#app-mount [class*="chat_"]:has([class*="callContainer"]),
#app-mount [class*="channelChatWrapper_"],
#app-mount [class*="chatContent_"]:has([class*="callContainer"]),
#app-mount [class*="chat_"]:has([class*="video_"]),
#app-mount [class*="chatContent_"]:has([class*="video_"]),
#app-mount [class*="chat_"]:has([class*="videoGrid"]),
#app-mount [class*="chatContent_"]:has([class*="videoGrid"]),
#app-mount [class*="wrapper_"]:has([class*="voiceChannel_"]),
#app-mount [class*="container_"]:has([class*="voiceChannel_"]),
#app-mount [class*="chat_"]:has([class*="voiceChannel_"]),
#app-mount [class*="chatContent_"]:has([class*="voiceChannel_"]),
#app-mount [class*="voiceChannel_"],
#app-mount [class*="voiceChannel_"] [class*="wrapper_"],
#app-mount [class*="voiceChannel_"] [class*="container_"],
#app-mount [class*="voiceChannel_"] [class*="content_"],
#app-mount [class*="voiceChannel_"] [class*="card_"],
#app-mount [class*="voiceChannel_"] [class*="body_"],
#app-mount [class*="voiceChannel_"] [class*="inner_"],
#app-mount [class*="voiceChannel_"] [class*="center_"],
#app-mount [class*="voiceChannel_"] [class*="scroller_"],
#app-mount [class*="voiceChannel_"] [class*="lobby_"],
#app-mount [class*="voiceChannel_"] [class*="panel_"],
#app-mount [class*="voiceChannel_"] [class*="previewWrapper_"],
#app-mount [class*="voiceChannel_"] [class*="preview_"],
#app-mount [class*="voiceChannel_"] [class*="emptyState_"],
#app-mount [class*="voiceChannelCard_"],
#app-mount [class*="voiceCard_"],
#app-mount [class*="previewWrapper_"],
#app-mount [class*="previewContainer_"],
#app-mount [class*="voiceChannelEffectsContainer_"],
#app-mount [class*="voiceChannelEffectsContainer"],
#app-mount [class*="voiceUsers_"],
#app-mount [class*="voiceUsers_"] [class*="scroller_"],
#app-mount [class*="voiceUsers_"] [class*="content_"],
#app-mount [class*="voiceUsersList_"],
#app-mount [class*="voiceUserList_"],
#app-mount [class*="channelBottomBarArea"],
#app-mount [class*="channelBottomBarArea_"],
#app-mount [class*="channelBottomBarArea_"] [class*="container_"],
#app-mount [class*="channelBottomBarArea_"] [class*="wrapper_"],
#app-mount [class*="stageSection"],
#app-mount [class*="stageSection_"],
#app-mount [class*="stageContainer"],
#app-mount [class*="stageContainer_"],
#app-mount [class*="stagePrompt_"],
#app-mount [class*="stageCard_"],
#app-mount [class*="stageParticipant_"],
#app-mount [class*="prompt_"][class*="stage_"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* Annihilate pulse gradient & video background overlays */
#app-mount [class*="pulseGradient"],
#app-mount [class*="pulseGradient_"],
#app-mount .pulseGradient__11664,
#app-mount [class*="gradientContainer"],
#app-mount [class*="gradientContainer_"],
#app-mount [class*="videoBackground"],
#app-mount [class*="videoBackground_"],
#app-mount [class*="gradient_"]:not([class*="banner"]):not([class*="badge"]),
#app-mount [class*="idle_"] [class*="gradient_"],
#app-mount [class*="callContainer"] [class*="gradientContainer"],
#app-mount [class*="callContainer"] [class*="pulseGradient"],
#app-mount [class*="voiceChannel"] [class*="gradientContainer"],
#app-mount [class*="voiceChannel"] [class*="pulseGradient"] {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
}

/* Remove solid dark navy/purple/black gradient overlays that block wallpaper in voice calls and voice channels */
#app-mount [class*="background_"][class*="video_"],
#app-mount [class*="idle"][class*="gradientContainer"],
#app-mount [class*="idle_"][class*="gradientContainer_"],
#app-mount [class*="callContainer"] [class*="idle_"],
#app-mount [class*="callContainer"] canvas,
#app-mount [class*="callContainer"] [class*="background_"]:not([class*="tile"]):not([class*="user"]):not([class*="avatar"]),
#app-mount [class*="voiceChannel"] [class*="background_"],
#app-mount [class*="voiceChannel"] canvas {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* 2. User Boxes & Participant Tiles (Connected & in Voice Views) */
#app-mount [class*="callContainer"] [class*="tile_"],
#app-mount [class*="callContainer"] [class*="tileChild_"],
#app-mount [class*="videoGrid"] [class*="tile_"],
#app-mount [class*="videoGrid_"] [class*="tile_"],
#app-mount [class*="tile_"]:not([class*="emoji"]):not([class*="sticker"]):not([class*="reaction"]):not([class*="item"]):not([class*="icon"]),
#app-mount [class*="tileChild_"],
#app-mount [class*="tileInner_"],
#app-mount [class*="userTile_"],
#app-mount [class*="videoTile_"],
#app-mount [class*="tile__72090"],
#app-mount [data-selenium-video-tile],
#app-mount [class*="root_"][class*="tile_"],
#app-mount [class*="flex_"][class*="tile_"],
#app-mount [class*="voiceUser_"],
#app-mount [class*="voiceUsers_"] [class*="user_"],
#app-mount [class*="voiceUsers_"] [class*="tile_"],
#app-mount [class*="voiceUsers_"] [class*="userTile_"],
#app-mount [class*="voiceUsers_"] [class*="card_"],
#app-mount [class*="participant_"],
#app-mount [class*="participantTile_"],
#app-mount [class*="participantCard_"] {
    background: rgba(0, 0, 0, 0.35) !important;
    background-color: rgba(0, 0, 0, 0.35) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
}

/* Clear solid opaque inner backgrounds inside user boxes / tiles so glass shows through */
#app-mount [class*="tile_"] [class*="background_"],
#app-mount [class*="tileChild_"] [class*="background_"],
#app-mount [class*="tileInner_"] [class*="background_"],
#app-mount [class*="userTile_"] [class*="background_"],
#app-mount [class*="videoTile_"] [class*="background_"],
#app-mount [class*="tileChild_"] > div:not([class*="overlay_"]):not([class*="indicators_"]):not([class*="status_"]):not([class*="avatar_"]):not([class*="avatarWrapper_"]),
#app-mount [class*="videoGrid_"] [class*="background_"],
#app-mount [class*="videoWrapper_"] [class*="background_"],
#app-mount [class*="callContainer"] [class*="tile_"] [class*="background_"],
#app-mount [class*="callContainer"] [class*="background_"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
}

/* Translucent glass for voice channel lobby / preview card / stage card when not connected */
#app-mount [class*="voiceChannel_"] [class*="card_"],
#app-mount [class*="voiceChannel_"] [class*="emptyState_"],
#app-mount [class*="voiceChannelCard_"],
#app-mount [class*="voiceCard_"],
#app-mount [class*="stageCard_"],
#app-mount [class*="stagePrompt_"] {
    background: rgba(0, 0, 0, 0.3) !important;
    background-color: rgba(0, 0, 0, 0.3) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 12px !important;
}

/* Voice Channel empty state text readability */
#app-mount [class*="voiceChannel_"] h2,
#app-mount [class*="voiceChannel_"] [class*="title_"],
#app-mount [class*="callContainer"] h2,
#app-mount [class*="callContainer"] [class*="title_"] {
    color: #ffffff !important;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85) !important;
}

/* 3. Voice call bottom controls & floating action bars */
#app-mount [class*="bottomControls"],
#app-mount [class*="bottomControls_"],
#app-mount [class*="videoControls"],
#app-mount [class*="videoControls_"],
#app-mount [class*="controlSection"],
#app-mount [class*="controlSection_"],
#app-mount [class*="actionButtons_"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* 4. Sidebar active voice connection panel */
#app-mount [class*="connection_"],
#app-mount [class*="voiceUsersList_"],
#app-mount [class*="container_"]:has([class*="connection_"]) {
    background-color: transparent !important;
}
`;

// Update all 83 theme files in themes/ and windows/embed/themes/
const themeDirs = [
    path.join(__dirname, "../themes"),
    path.join(__dirname, "../windows/embed/themes")
];

const voiceMarker1 = "/* =======================================================================\n   Complete Voice Channel, Stage & Video Call Transparency & Theming";
const voiceMarker2 = "/*Noise Suporession*/";

for (const dir of themeDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".theme.css"));
    for (const f of files) {
        const fullPath = path.join(dir, f);
        let tCss = fs.readFileSync(fullPath, "utf8");
        let modified = false;

        // Replace panels background with glass transparency
        const panelsRegex = /#app-mount\s+\.panels__5e434\s*\{\s*background-color:\s*var\(--secondary3-colour\);?\s*\}/g;
        if (panelsRegex.test(tCss)) {
            tCss = tCss.replace(panelsRegex, "#app-mount .panels__5e434 { background-color: rgba(0, 0, 0, 0.28) !important; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid rgba(255, 255, 255, 0.08); }");
            modified = true;
        }

        const panelBtnsRegex = /(#app-mount\s+\.panels__5e434\s+\.flex__7c0ba\s+\.button__67645,\s*#app-mount\s+\.panels__5e434\s+\.actionButtons_e131a9\s*\{\s*)background-color:\s*var\(--secondary3-colour\);/g;
        if (panelBtnsRegex.test(tCss)) {
            tCss = tCss.replace(panelBtnsRegex, "$1background-color: transparent !important;");
            modified = true;
        }

        const titleRegex = /#app-mount\s+\.title_c38106\s*\{\s*background-color:\s*var\(--secondary3-colour\);\s*border-bottom:\s*3px\s+solid\s+var\(--primary3-colour\)\s*\}/g;
        if (titleRegex.test(tCss)) {
            tCss = tCss.replace(titleRegex, "#app-mount .title_c38106 { background-color: rgba(0, 0, 0, 0.22) !important; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; }");
            modified = true;
        }

        const subtitleRegex = /#app-mount\s+\.subtitleContainer_f75fb0\s*\{\s*background-color:\s*var\(--secondary3-colour\);?\s*\}/g;
        if (subtitleRegex.test(tCss)) {
            tCss = tCss.replace(subtitleRegex, "#app-mount .subtitleContainer_f75fb0 { background-color: rgba(0, 0, 0, 0.22) !important; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }");
            modified = true;
        }

        // Update voice channel & user boxes section
        const idx1 = tCss.indexOf(voiceMarker1);
        const idx2 = tCss.indexOf(voiceMarker2);
        if (idx1 !== -1 && idx2 !== -1) {
            tCss = tCss.substring(0, idx1) + themeVoiceSectionCss + tCss.substring(idx2);
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(fullPath, tCss, "utf8");
        }
    }
    console.log(`[inject] Updated theme files in ${dir}`);
}

// Deploy updated themes and vencord dist to live config directories (~/.config/Vencord & ~/.config/BetterDiscord)
const targetHomes = ['/home/admin', '/home/ben', process.env.HOME].filter(Boolean);
for (const h of new Set(targetHomes)) {
    const vcThemes = path.join(h, '.config/Vencord/themes');
    if (fs.existsSync(vcThemes)) {
        const srcDir = path.join(__dirname, '../themes');
        for (const f of fs.readdirSync(srcDir).filter(x => x.endsWith('.theme.css'))) {
            fs.copyFileSync(path.join(srcDir, f), path.join(vcThemes, f));
        }
        console.log(`[deploy] Deployed 83 themes to ${vcThemes}`);
    }
    const bdThemes = path.join(h, '.config/BetterDiscord/themes');
    if (fs.existsSync(bdThemes)) {
        const srcDir = path.join(__dirname, '../themes');
        for (const f of fs.readdirSync(srcDir).filter(x => x.endsWith('.theme.css'))) {
            fs.copyFileSync(path.join(srcDir, f), path.join(bdThemes, f));
        }
        console.log(`[deploy] Deployed 83 themes to ${bdThemes}`);
    }
    const vcDist = path.join(h, '.config/Vencord/dist');
    if (fs.existsSync(vcDist)) {
        const distSrc = path.join(__dirname, '../vencord/dist');
        for (const f of ['renderer.css', 'renderer.js']) {
            if (fs.existsSync(path.join(distSrc, f))) {
                fs.copyFileSync(path.join(distSrc, f), path.join(vcDist, f));
            }
        }
        console.log(`[deploy] Deployed renderer files to ${vcDist}`);
    }
}

console.log("[inject-custom-plugins] All components updated successfully!");
