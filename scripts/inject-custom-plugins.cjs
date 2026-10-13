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

// Glass Theme Search Bar Component
const modernSearchL4 = `function l4(){let e=De(["enabledThemes"]),t=Ue(null),[o,n]=C(null),[q,sq]=C("");Z(()=>{i()},[]);async function i(){let s=await VencordNative.themes.getThemesList();n(s)}let filt=o?.filter(s=>{if(!q)return true;let lk=q.toLowerCase().trim();if(!lk)return true;let terms=lk.split(/\\s+/);return terms.every(term=>(s.name&&s.name.toLowerCase().includes(term))||(s.fileName&&s.fileName.toLowerCase().includes(term))||(s.description&&s.description.toLowerCase().includes(term))||(s.author&&s.author.toLowerCase().includes(term)))});return r(X,{flexDirection:"column",gap:"1em"},r(Ae,null,r(A.FormTitle,{tag:"h5"},"Find Themes:"),r(X,{gap:"0.4em",flexDirection:"column",justifyContent:"flex-start",className:D.bottom8},r("span",null,"\\u2013 ",r($e,{href:"https://betterdiscord.app/themes"},"BetterDiscord theme list")),r("span",null,"\\u2013 ",r($e,{href:"https://github.com/search?q=discord+theme"},"GitHub"))),r(A.FormText,null,"If using the BD site, click on Download and place the downloaded .theme.css file into your themes folder.")),r(Ae,null,r(A.FormTitle,{tag:"h5"},"External Resources"),r(A.FormText,null,"For security reasons, loading resources from most sites is blocked."),r(A.FormText,null,"Make sure all your assets are hosted on GitHub, GitLab, Codeberg, Imgur, Discord or Google Fonts.")),r("section",null,r(A.FormTitle,{tag:"h5"},"Local Themes"),r(ou,null,r(p,null,r(vr,{text:"Open Themes Folder",action:()=>VencordNative.themes.openFolder(),Icon:mc}),r(vr,{text:"Load missing Themes",action:i,Icon:ts}),r(vr,{text:"Edit QuickCSS",action:()=>VencordNative.quickCss.openEditor(),Icon:os}),xe(xs.name)&&r(vr,{text:"Edit ClientTheme",action:()=>gr(xs),Icon:fc})))),r("div",{className:"vc-theme-search-container "+D.top16},r("div",{className:"vc-theme-search-bar"},r("svg",{className:"vc-theme-search-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},r("circle",{cx:"11",cy:"11",r:"8"}),r("line",{x1:"21",y1:"21",x2:"16.65",y2:"16.65"})),r("input",{type:"text",className:"vc-theme-search-input",placeholder:"Search 83+ themes by name, author, or keyword...",value:q,onChange:v=>sq(v.target.value),autoFocus:!1,spellCheck:!1}),q?r("button",{type:"button",className:"vc-theme-search-clear",onClick:()=>sq(""),title:"Clear search"},"\\u2715"):null,o?r("div",{className:"vc-theme-search-badge"},filt?(filt.length+" / "+o.length):""):null)),filt?.length?r("div",{className:H8("grid")},filt.map(s=>r(s4,{key:s.fileName,enabled:e.enabledThemes.includes(s.fileName),onChange:l=>a4(s.fileName,l),onDelete:async()=>{a4(s.fileName,!1);await VencordNative.themes.deleteTheme(s.fileName);i()},theme:s}))):r(z,{className:D.top16},q?"No themes found matching \\""+q+"\\". Try searching for another name, anime, or author.":"No themes found in your themes folder."))}`;

// Process renderer.js files
for (const rPath of rendererPaths) {
    if (!fs.existsSync(rPath)) continue;
    let content = fs.readFileSync(rPath, "utf8");

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
const glassCss = `
/* =======================================================================
   Complete Glass Transparency & Modern UI Enhancement
   ======================================================================= */

/* Root window transparency */
html, body, #app-mount, .app_de4237, .app__160d8, .appMount_ea7e65, .app_a0120,
.bg__960e4, .bg_d4b6c5, .layers__160d8, .layers_a0120, .layers__960e4, .layer__960e4, .container__5c7e7 {
    background: transparent !important;
    background-color: transparent !important;
}

/* Server icon sidebar */
.guilds__5e434, .wrapper_ef3116, [class*="guilds_"], [class*="tree_"],
[class*="scroller_"][class*="guilds"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Channel list sidebar and category headers */
.sidebar_c48ade, .sidebar__5e434, [class*="sidebar_"]:not([class*="sidebarContainer_"]),
.container__ee69e, .container__2637a, .channels__9a337, [class*="channels_"],
[class*="sidebarList_"] {
    background: transparent !important;
    background-color: transparent !important;
}

[class*="sidebar_"] [class*="scroller_"] {
    background: transparent !important;
}

/* Main chat and message area */
.chat_f75fb0, .chat__52833, [class*="chat_"]:not([class*="chatSidebar"]),
.chatContent_f75fb0, .chatContent__52833, [class*="chatContent_"],
[class*="messagesWrapper_"], [class*="scroller_"][class*="messages"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Member list sidebar */
[class*="membersWrap_"], [class*="members_"] {
    background: transparent !important;
    background-color: transparent !important;
}

/* Voice call container & video stage */
[class*="callContainer_"], [class*="wrapper_"][class*="video_"] {
    background: rgba(0, 0, 0, 0.35) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
}

/* Top navigation, title bar, and channel headers */
.title_c38106, .title_f75fb0, [class*="title_"][class*="container_"],
.subtitleContainer_f75fb0, [class*="subtitleContainer_"],
[class*="headerBar_"]:not([class*="shop"]), section[class*="title_"] {
    background: rgba(0, 0, 0, 0.22) !important;
    background-color: rgba(0, 0, 0, 0.22) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

/* Bottom user profile and voice-control panel */
.panels__5e434, [class*="panels_"], section[class*="panels_"] {
    background: rgba(0, 0, 0, 0.28) !important;
    background-color: rgba(0, 0, 0, 0.28) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.panels__5e434 .flex__7c0ba .button__67645,
.panels__5e434 .actionButtons_e131a9,
.panels__5e434 [class*="button_"] {
    background-color: transparent !important;
}

.panels__5e434 [class*="button_"]:hover,
.panels__5e434 [class*="avatarWrapper_"]:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
}

/* Supported dropdowns, context menus, and popouts */
.menu__44b0c, [class*="menu_"][role="menu"],
.popout_a16aea, [class*="popout_"]:not([class*="messagePopover"]),
[class*="messagesPopoutWrap_"], [class*="recentMentionsPopout_"],
[class*="quickswitcher_"] {
    background: rgba(18, 20, 26, 0.8) !important;
    background-color: rgba(18, 20, 26, 0.8) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
    border-radius: 8px !important;
}

[class*="menu_"] [class*="item_"]:hover,
[class*="menu_"] [class*="item_"][class*="focused_"] {
    background-color: rgba(255, 255, 255, 0.12) !important;
}

/* Chat text input bar glass style */
[class*="channelTextArea_"] {
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

// Update all 83 theme files in themes/ and windows/embed/themes/
const themeDirs = [
    path.join(__dirname, "../themes"),
    path.join(__dirname, "../windows/embed/themes")
];

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

        if (modified) {
            fs.writeFileSync(fullPath, tCss, "utf8");
        }
    }
    console.log(`[inject] Updated theme files in ${dir}`);
}

console.log("[inject-custom-plugins] All components updated successfully!");
