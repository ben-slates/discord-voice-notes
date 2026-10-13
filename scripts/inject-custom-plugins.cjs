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

fs.writeFileSync(rendererPath, content, "utf8");
console.log("[inject-custom-plugins] Injected successfully!");
