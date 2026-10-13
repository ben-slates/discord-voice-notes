#!/usr/bin/env node
/**
 * Offline Vencord & DiscordVoiceNotes Patcher for Debian/Kali Linux
 * Performs byte-compatible asar patching and modular desktop core patching
 * without requiring internet or GitHub API access.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const NC = "\x1b[0m";

function logInfo(msg) { console.log(`${BLUE}--> [INFO]${NC} ${msg}`); }
function logOk(msg) { console.log(`${GREEN}    [OK]${NC} ${msg}`); }
function logWarn(msg) { console.log(`${YELLOW}    [WARN]${NC} ${msg}`); }
function logError(msg) { console.error(`${RED}    [ERROR]${NC} ${msg}`); }

// 1. Determine target user & home directory
const targetUser = process.env.TARGET_USER || process.env.SUDO_USER || process.env.USER || os.userInfo().username;
let targetHome = process.env.TARGET_HOME || process.env.HOME;

if (!process.env.TARGET_HOME) {
    try {
        const passwdLine = execSync(`getent passwd ${targetUser} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (passwdLine) {
            const parts = passwdLine.split(":");
            if (parts[5]) targetHome = parts[5];
        }
    } catch (_) {}
}

let uid = null;
let gid = null;
if (process.getuid && process.getuid() === 0 && process.env.SUDO_USER) {
    try {
        const idOut = execSync(`id -u ${targetUser}`, { encoding: "utf8" }).trim();
        const gidOut = execSync(`id -g ${targetUser}`, { encoding: "utf8" }).trim();
        uid = parseInt(idOut, 10);
        gid = parseInt(gidOut, 10);
    } catch (_) {}
}

function chownRecursive(dirPath) {
    if (uid !== null && gid !== null && fs.existsSync(dirPath)) {
        try {
            fs.chownSync(dirPath, uid, gid);
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    chownRecursive(fullPath);
                } else {
                    fs.chownSync(fullPath, uid, gid);
                }
            }
        } catch (err) {
            // non-fatal
        }
    }
}

// 2. Discover all Discord installation entry points
function discoverDiscordTargets() {
    const targets = [];

    // Check ~/.config/discord, discordcanary, discordptb
    const discordNames = ["discord", "discordcanary", "discordptb"];
    for (const name of discordNames) {
        const confDir = path.join(targetHome, ".config", name);
        if (fs.existsSync(confDir)) {
            // Look for app-* directories
            try {
                const entries = fs.readdirSync(confDir);
                for (const entry of entries) {
                    if (entry.startsWith("app-")) {
                        const appDir = path.join(confDir, entry);
                        const resDir = path.join(appDir, "resources");
                        if (fs.existsSync(resDir)) {
                            targets.push({
                                kind: "app-asar",
                                name: `${name} (${entry})`,
                                resourcesDir: resDir,
                                appAsar: path.join(resDir, "app.asar"),
                                origAsar: path.join(resDir, "_app.asar")
                            });
                        }
                    }
                }
            } catch (_) {}

            // Recursively find discord_desktop_core modules
            function findDesktopCores(curDir, depth = 0) {
                if (depth > 5) return;
                try {
                    const items = fs.readdirSync(curDir, { withFileTypes: true });
                    for (const item of items) {
                        const full = path.join(curDir, item.name);
                        if (item.isDirectory()) {
                            if (item.name === "discord_desktop_core") {
                                const indexJs = path.join(full, "index.js");
                                const coreAsar = path.join(full, "core.asar");
                                if (fs.existsSync(indexJs) || fs.existsSync(coreAsar)) {
                                    targets.push({
                                        kind: "desktop-core",
                                        name: `${name} modular core`,
                                        coreDir: full,
                                        indexJs: indexJs,
                                        coreAsar: coreAsar
                                    });
                                }
                            } else if (!item.name.startsWith(".")) {
                                findDesktopCores(full, depth + 1);
                            }
                        }
                    }
                } catch (_) {}
            }
            findDesktopCores(confDir);
        }
    }

    // System candidates
    const sysCandidates = [
        "/usr/share/discord",
        "/opt/discord",
        "/usr/lib/discord",
        "/usr/lib64/discord",
        path.join(targetHome, ".local/share/discord"),
        "/var/lib/flatpak/app/com.discordapp.Discord/current/active/files/discord",
        path.join(targetHome, ".local/share/flatpak/app/com.discordapp.Discord/current/active/files/discord"),
        "/snap/discord/current/usr/share/discord"
    ];

    // Dynamically resolve Discord executable from PATH
    for (const binName of ["discord", "discord-canary", "discord-ptb"]) {
        try {
            const binPath = execSync(`command -v ${binName} 2>/dev/null || true`, { encoding: "utf8" }).trim();
            if (binPath && fs.existsSync(binPath)) {
                let resolved = binPath;
                try { resolved = fs.realpathSync(binPath); } catch (_) {}
                sysCandidates.push(path.dirname(resolved));
                sysCandidates.push(path.dirname(path.dirname(resolved)));
                try {
                    const scriptBody = fs.readFileSync(binPath, "utf8");
                    const matches = scriptBody.match(/(?:\/usr\/share|\/opt|\/usr\/lib|\/var\/lib\/flatpak)[^ \n\r"']+/g);
                    if (matches) {
                        for (const m of matches) {
                            sysCandidates.push(path.dirname(m));
                        }
                    }
                } catch (_) {}
            }
        } catch (_) {}
    }

    const seenDirs = new Set();
    for (const dir of sysCandidates) {
        if (!dir || seenDirs.has(dir)) continue;
        seenDirs.add(dir);
        const resDir = path.join(dir, "resources");
        if (fs.existsSync(resDir) && (fs.existsSync(path.join(resDir, "app.asar")) || fs.existsSync(path.join(resDir, "_app.asar")))) {
            targets.push({
                kind: "app-asar",
                name: `System Discord (${dir})`,
                resourcesDir: resDir,
                appAsar: path.join(resDir, "app.asar"),
                origAsar: path.join(resDir, "_app.asar")
            });
        }
    }

    return targets;
}

// 3. Asar Generator (Byte-compatible with Vencord Go installer)
function generateAppAsar(patcherPath) {
    const pkgJson = `{\n\t"name": "discord",\n\t"main": "index.js"\n}`;
    const indexJs = `require(${JSON.stringify(patcherPath)})`;
    const indexBytes = Buffer.from(indexJs, "utf8");
    const pkgBytes = Buffer.from(pkgJson, "utf8");
    const fileContents = Buffer.concat([indexBytes, pkgBytes]);

    const header = {
        files: {
            "index.js": { size: indexBytes.length, offset: "0" },
            "package.json": { size: pkgBytes.length, offset: String(indexBytes.length) }
        }
    };
    let headerStr = JSON.stringify(header);
    const dataSize = 4;
    const alignedSize = Math.ceil(headerStr.length / dataSize) * dataSize;
    if (alignedSize > headerStr.length) {
        headerStr += "0".repeat(alignedSize - headerStr.length);
    }
    const headerBuf = Buffer.from(headerStr, "utf8");
    const headerSize = alignedSize + 8;
    const headerObjSize = alignedSize + dataSize;

    const prefix = Buffer.alloc(16);
    prefix.writeUInt32LE(dataSize, 0);
    prefix.writeUInt32LE(headerSize, 4);
    prefix.writeUInt32LE(headerObjSize, 8);
    prefix.writeUInt32LE(headerStr.length, 12);

    return Buffer.concat([prefix, headerBuf, fileContents]);
}

// 4. Action Execution
const action = process.argv[2] || "install";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
let vencordDistSrc = path.join(ROOT_DIR, "vencord", "dist");
if (!fs.existsSync(vencordDistSrc)) {
    vencordDistSrc = "/usr/share/discord-voice-notes/vencord/dist";
}

const vencordUserDir = path.join(targetHome, ".config", "Vencord");
const vencordDistDest = path.join(vencordUserDir, "dist");
const patcherFilePath = path.join(vencordDistDest, "patcher.js");

if (action === "install") {
    console.log("==========================================================");
    console.log("       Discord Voice Notes & Vencord Offline Setup        ");
    console.log("==========================================================");
    logInfo(`Target user: ${targetUser} (${targetHome})`);

    // Step A: Install Vencord runtime dist files
    if (fs.existsSync(vencordDistSrc)) {
        logInfo(`Deploying offline Vencord runtime to ${vencordDistDest}...`);
        fs.mkdirSync(vencordDistDest, { recursive: true });
        const files = fs.readdirSync(vencordDistSrc);
        for (const file of files) {
            fs.copyFileSync(path.join(vencordDistSrc, file), path.join(vencordDistDest, file));
        }
        chownRecursive(vencordUserDir);
        logOk("Vencord runtime files installed.");
    } else {
        logWarn(`Source Vencord dist not found at ${vencordDistSrc}.`);
    }

    // Step B: Discover Discord targets
    const targets = discoverDiscordTargets();
    if (targets.length === 0) {
        logError("No Discord desktop application or modular core was found in:");
        console.log(`    - ${targetHome}/.config/discord/app-*`);
        console.log("    - /usr/share/discord");
        console.log("    - /opt/discord");
        console.log("Please run Discord once so it can initialize its app directory.");
        process.exit(1);
    }

    let patchedCount = 0;

    for (const target of targets) {
        logInfo(`Found target: ${target.name} (${target.kind})`);

        if (target.kind === "app-asar") {
            try {
                // If already patched, restore first
                if (fs.existsSync(target.origAsar)) {
                    logInfo(`Refreshing existing patch in ${target.resourcesDir}...`);
                    if (fs.existsSync(target.appAsar)) fs.unlinkSync(target.appAsar);
                    fs.renameSync(target.origAsar, target.appAsar);
                }

                if (fs.existsSync(target.appAsar)) {
                    logInfo(`Backing up original app.asar -> _app.asar...`);
                    fs.renameSync(target.appAsar, target.origAsar);

                    logInfo(`Writing Vencord loader app.asar...`);
                    const asarBuf = generateAppAsar(patcherFilePath);
                    fs.writeFileSync(target.appAsar, asarBuf);
                    fs.chmodSync(target.appAsar, 0o644);
                    logOk(`Successfully patched ${target.name}`);
                    patchedCount++;
                }
            } catch (err) {
                logWarn(`Could not patch app.asar in ${target.resourcesDir}: ${err.message}`);
            }
        }

        if (target.kind === "desktop-core") {
            try {
                if (fs.existsSync(target.indexJs)) {
                    const content = fs.readFileSync(target.indexJs, "utf8");
                    const patchRequire = `require(${JSON.stringify(patcherFilePath)});\n`;

                    if (!content.includes(patcherFilePath)) {
                        logInfo(`Backing up index.js in ${target.coreDir}...`);
                        const origIndex = path.join(target.coreDir, "index.js.orig");
                        if (!fs.existsSync(origIndex)) {
                            fs.writeFileSync(origIndex, content);
                        }

                        logInfo(`Injecting Vencord loader into ${target.indexJs}...`);
                        const newContent = `${patchRequire}${content}`;
                        fs.writeFileSync(target.indexJs, newContent);
                        logOk(`Successfully patched modular core at ${target.name}`);
                        patchedCount++;
                    } else {
                        logOk(`Modular core already patched: ${target.name}`);
                        patchedCount++;
                    }
                } else if (fs.existsSync(target.coreAsar)) {
                    logInfo(`Creating loader index.js in ${target.coreDir}...`);
                    const newContent = `require(${JSON.stringify(patcherFilePath)});\nmodule.exports = require("./core.asar");\n`;
                    fs.writeFileSync(target.indexJs, newContent);
                    logOk(`Successfully patched modular core at ${target.name}`);
                    patchedCount++;
                }
            } catch (err) {
                logWarn(`Could not patch modular core in ${target.coreDir}: ${err.message}`);
            }
        }
    }

    // Step C: Install DiscordVoiceNotes userplugin
    let installScript = path.join(ROOT_DIR, "scripts", "install.sh");
    if (!fs.existsSync(installScript)) {
        installScript = "/usr/share/discord-voice-notes/scripts/install.sh";
    }

    if (fs.existsSync(installScript)) {
        logInfo("Installing DiscordVoiceNotes userplugin...");
        try {
            execSync(`bash "${installScript}" --userplugin`, { stdio: "inherit" });
        } catch (err) {
            logWarn(`Userplugin copy encountered an issue: ${err.message}`);
        }
    }

    // Step D: Auto-enable VoiceMessages (Discord Voice Notes) and optional FakeNitro in Vencord Settings
    const enableFakeNitro = process.env.ENABLE_FAKE_NITRO === "1" || process.argv.includes("--enable-nitro");
    const settingsPaths = [
        path.join(vencordUserDir, "settings", "settings.json"),
        path.join(vencordUserDir, "settings.json")
    ];
    for (const sPath of settingsPaths) {
        try {
            let settingsObj = {};
            if (fs.existsSync(sPath)) {
                try { settingsObj = JSON.parse(fs.readFileSync(sPath, "utf8")); } catch (_) {}
            }
            settingsObj.transparent = true;
            settingsObj.plugins = settingsObj.plugins || {};
            settingsObj.plugins.VoiceMessages = settingsObj.plugins.VoiceMessages || {};
            settingsObj.plugins.VoiceMessages.enabled = true;

            // Unlimited message characters (auto split)
            settingsObj.plugins.SplitLargeMessages = settingsObj.plugins.SplitLargeMessages || {};
            settingsObj.plugins.SplitLargeMessages.enabled = true;

            // Unlimited file upload size (Catbox direct)
            settingsObj.plugins.CatboxUploadButton = settingsObj.plugins.CatboxUploadButton || {};
            settingsObj.plugins.CatboxUploadButton.enabled = true;

            // DM Archive (Visual Transcript & Data Backup)
            settingsObj.plugins.DMArchive = settingsObj.plugins.DMArchive || {};
            settingsObj.plugins.DMArchive.enabled = true;

            if (enableFakeNitro) {
                settingsObj.plugins.FakeNitro = settingsObj.plugins.FakeNitro || {};
                settingsObj.plugins.FakeNitro.enabled = true;
                settingsObj.plugins.FakeNitro.enableEmojiBypass = true;
                settingsObj.plugins.FakeNitro.transformEmojis = true;
                settingsObj.plugins.FakeNitro.enableStickerBypass = true;
                settingsObj.plugins.FakeNitro.transformStickers = true;
                settingsObj.plugins.FakeNitro.enableStreamQualityBypass = true;
                settingsObj.plugins.FakeNitro.useHyperLinks = true;
                settingsObj.plugins.FakeProfileThemes = settingsObj.plugins.FakeProfileThemes || {};
                settingsObj.plugins.FakeProfileThemes.enabled = true;
            }

            fs.mkdirSync(path.dirname(sPath), { recursive: true });
            fs.writeFileSync(sPath, JSON.stringify(settingsObj, null, 4));
            logOk(`Auto-enabled VoiceMessages, SplitLargeMessages, CatboxUploadButton, and DMArchive in ${sPath}`);
            if (enableFakeNitro) {
                logOk(`Auto-enabled FakeNitro and FakeProfileThemes in ${sPath}`);
            }
        } catch (err) {
            logWarn(`Could not write settings to ${sPath}: ${err.message}`);
        }
    }

    // Ensure user permissions on all user config dirs
    chownRecursive(vencordUserDir);
    const discordConf = path.join(targetHome, ".config", "discord");
    chownRecursive(discordConf);

    console.log("");
    if (patchedCount > 0) {
        console.log(`${GREEN}==========================================================${NC}`);
        console.log(`${GREEN} Vencord & Discord Voice Notes setup completed offline!   ${NC}`);
        console.log(`${GREEN} Patched ${patchedCount} Discord target(s) successfully.             ${NC}`);
        console.log(`${GREEN}==========================================================${NC}`);
        console.log("Please restart Discord to enjoy voice message recording.");
        process.exit(0);
    } else {
        logError("Could not apply patch to any Discord targets.");
        process.exit(1);
    }

} else if (action === "uninstall" || action === "restore") {
    console.log("==========================================================");
    console.log("       Discord Voice Notes - Restoration & Unpatch        ");
    console.log("==========================================================");

    const targets = discoverDiscordTargets();
    let restoredCount = 0;

    for (const target of targets) {
        if (target.kind === "app-asar") {
            try {
                if (fs.existsSync(target.origAsar)) {
                    logInfo(`Restoring original app.asar in ${target.resourcesDir}...`);
                    if (fs.existsSync(target.appAsar)) fs.unlinkSync(target.appAsar);
                    fs.renameSync(target.origAsar, target.appAsar);
                    logOk(`Restored ${target.name}`);
                    restoredCount++;
                }
            } catch (err) {
                logWarn(`Failed to restore ${target.resourcesDir}: ${err.message}`);
            }
        }

        if (target.kind === "desktop-core") {
            try {
                const origIndex = path.join(target.coreDir, "index.js.orig");
                if (fs.existsSync(origIndex)) {
                    logInfo(`Restoring original index.js in ${target.coreDir}...`);
                    fs.copyFileSync(origIndex, target.indexJs);
                    fs.unlinkSync(origIndex);
                    logOk(`Restored ${target.name}`);
                    restoredCount++;
                } else if (fs.existsSync(target.indexJs)) {
                    const content = fs.readFileSync(target.indexJs, "utf8");
                    if (content.includes("patcher.js")) {
                        const cleanContent = content.replace(/require\(.*patcher\.js.*\);?\n?/g, "");
                        fs.writeFileSync(target.indexJs, cleanContent);
                        logOk(`Cleaned patch from ${target.name}`);
                        restoredCount++;
                    }
                }
            } catch (err) {
                logWarn(`Failed to restore ${target.coreDir}: ${err.message}`);
            }
        }
    }

    if (restoredCount > 0) {
        console.log(`${GREEN}Successfully restored ${restoredCount} Discord component(s) to vanilla.${NC}`);
    } else {
        console.log(`${BLUE}Discord is already in its vanilla state.${NC}`);
    }
    process.exit(0);

} else {
    console.log(`Unknown action: ${action}`);
    process.exit(1);
}
