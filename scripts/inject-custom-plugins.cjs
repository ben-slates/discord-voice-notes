const fs = require("fs");
const path = require("path");

const rendererPath = path.join(__dirname, "../vencord/dist/renderer.js");
let content = fs.readFileSync(rendererPath, "utf8");

if (content.includes('name:"SplitLargeMessages"') && content.includes('name:"CatboxUploadButton"')) {
    console.log("[inject-custom-plugins] Plugins already injected.");
    process.exit(0);
}

// Custom plugins definition to append right after F2={waveform:"AAAAAAAAAAAA",duration:1};
const pluginCode = `
var _splitPending = new Map(), _splitTimer = null;
function _splitMsgSafe(e, t) {
    if (e.length <= t) return [e];
    var r = [], n = e.split(" ");
    for (var i = 0; i < n.length; i++) {
        var a = n[i];
        if (a.length <= t) r.push(a);
        else {
            var s = a;
            while (s.length > t) {
                r.push(s.slice(0, t));
                s = s.slice(t);
            }
            if (s.length > 0) r.push(s);
        }
    }
    var o = [], l = "";
    for (var c = 0; c < r.length; c++) {
        var u = r[c], d = l.length > 0 ? l + " " + u : u;
        if (l.length > 0 && d.length > t) {
            o.push(l);
            l = u;
        } else {
            l = d;
        }
    }
    if (l.length > 0) o.push(l);
    return o;
}
function _queueNextChunk(e) {
    var t = _splitPending.get(e);
    if (!t || !t.length) {
        _splitPending.delete(e);
        return;
    }
    var r = t.shift();
    if (!t.length) _splitPending.delete(e);
    if (!r) return;
    _splitTimer = setTimeout(function() {
        _splitTimer = null;
        try { if (EA && EA.clearDraft) EA.clearDraft(e, zt.ChannelMessage); } catch(_) {}
        try { Vi(r); } catch(_) {}
    }, 1000);
}
var _splitLargeMessagesPlugin = h({
    name: "SplitLargeMessages",
    description: "Splits messages exceeding the Discord character limit (2000 chars / 4000 Nitro) and automatically sends/queues consecutive chunks safely.",
    tags: ["Chat", "Utility", "Messages"],
    authors: [m.Ven],
    stop: function() {
        _splitPending.clear();
        if (_splitTimer) {
            clearTimeout(_splitTimer);
            _splitTimer = null;
        }
    },
    onBeforeMessageSend: function(e, t) {
        var r = t.content || "", n = (k.getCurrentUser()?.premiumType === 2 ? 4000 : 2000) - 20;
        if (_splitPending.has(e)) {
            if (r.length > 0) _queueNextChunk(e);
            return;
        }
        if (r.length <= n) return;
        var i = _splitMsgSafe(r, n).filter(function(s) { return s.length > 0; });
        if (!i.length) return;
        t.content = i.shift();
        if (i.length > 0) {
            _splitPending.set(e, i);
            _queueNextChunk(e);
        }
    }
});

function _triggerCatboxUpload() {
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
});
`;

// Insert after F2={waveform:"AAAAAAAAAAAA",duration:1};
const marker = 'F2={waveform:"AAAAAAAAAAAA",duration:1};';
if (!content.includes(marker)) {
    console.error("Could not find marker in renderer.js");
    process.exit(1);
}
content = content.replace(marker, marker + "\n" + pluginCode + "\n");

// Register in plugin map
content = content.replace(',[Mh.name]:Mh,', ',[Mh.name]:Mh,[_splitLargeMessagesPlugin.name]:_splitLargeMessagesPlugin,[_catboxUploadPlugin.name]:_catboxUploadPlugin,');

// Register in folder map
content = content.replace('[Mh.name]:{folderName:"voiceMessages",userPlugin:!1},', '[Mh.name]:{folderName:"voiceMessages",userPlugin:!1},[_splitLargeMessagesPlugin.name]:{folderName:"splitLargeMessages",userPlugin:!1},[_catboxUploadPlugin.name]:{folderName:"catboxUploadButton",userPlugin:!1},');

// Inject theme search bar if not present
if (!content.includes('placeholder:"Search 83+ themes by name, author, or keyword..."')) {
    const l4Start = content.indexOf("function l4(){");
    const l4End = content.indexOf("}a();b();function c4(){", l4Start);
    if (l4Start !== -1 && l4End !== -1) {
        const origL4 = content.substring(l4Start, l4End + 1);
        const searchL4 = `function l4(){let e=De(["enabledThemes"]),t=Ue(null),[o,n]=C(null),[q,sq]=C("");Z(()=>{i()},[]);async function i(){let s=await VencordNative.themes.getThemesList();n(s)}let filt=o?.filter(s=>{if(!q)return true;let lk=q.toLowerCase();return(s.name&&s.name.toLowerCase().includes(lk))||(s.fileName&&s.fileName.toLowerCase().includes(lk))||(s.description&&s.description.toLowerCase().includes(lk))||(s.author&&s.author.toLowerCase().includes(lk))});return r(X,{flexDirection:"column",gap:"1em"},r(Ae,null,r(A.FormTitle,{tag:"h5"},"Find Themes:"),r(X,{gap:"0.4em",flexDirection:"column",justifyContent:"flex-start",className:D.bottom8},r("span",null,"\\u2013 ",r($e,{href:"https://betterdiscord.app/themes"},"BetterDiscord theme list")),r("span",null,"\\u2013 ",r($e,{href:"https://github.com/search?q=discord+theme"},"GitHub"))),r(A.FormText,null,\x27If using the BD site, click on "Download" and place the downloaded .theme.css file into your themes folder.\x27)),r(Ae,null,r(A.FormTitle,{tag:"h5"},"External Resources"),r(A.FormText,null,"For security reasons, loading resources (styles, fonts, images, ...) from most sites is blocked."),r(A.FormText,null,"Make sure all your assets are hosted on GitHub, GitLab, Codeberg, Imgur, Discord or Google Fonts.")),r("section",null,r(A.FormTitle,{tag:"h5"},"Local Themes"),r(ou,null,r(p,null,r(vr,{text:"Open Themes Folder",action:()=>VencordNative.themes.openFolder(),Icon:mc}),r(vr,{text:"Load missing Themes",action:i,Icon:ts}),r(vr,{text:"Edit QuickCSS",action:()=>VencordNative.quickCss.openEditor(),Icon:os}),xe(xs.name)&&r(vr,{text:"Edit ClientTheme",action:()=>gr(xs),Icon:fc}))),r(N,{noop:!0},r(ct,{placeholder:"Search 83+ themes by name, author, or keyword...",value:q,onChange:v=>sq(v),className:D.top16,autoFocus:!1})),filt?.length?r("div",{className:H8("grid")},filt.map(s=>r(s4,{key:s.fileName,enabled:e.enabledThemes.includes(s.fileName),onChange:l=>a4(s.fileName,l),onDelete:async()=>{a4(s.fileName,!1),await VencordNative.themes.deleteTheme(s.fileName),i()},theme:s}))):r(z,{className:D.top16},"No themes found matching your search.")))}`;
        content = content.replace(origL4, searchL4);
    }
}

fs.writeFileSync(rendererPath, content, "utf8");
console.log("[inject-custom-plugins] Injected successfully!");
