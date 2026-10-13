import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const __dirname = import.meta.dirname;

test("Theme Scoping - renderer.css transparency rules are strictly scoped to active themes", () => {
    const cssPath = path.join(__dirname, "../vencord/dist/renderer.css");
    assert.ok(fs.existsSync(cssPath), "renderer.css should exist");
    const css = fs.readFileSync(cssPath, "utf8");

    const marker = "/* =======================================================================\n   Complete Glass Transparency & Modern UI Enhancement";
    const idx = css.indexOf(marker);
    assert.ok(idx !== -1, "Glass transparency marker should be present");

    const glassPart = css.substring(idx);
    const searchMarker = "/* =======================================================================\n   Modern Glass Theme Search Bar";
    const searchIdx = glassPart.indexOf(searchMarker);
    assert.ok(searchIdx !== -1, "Theme search bar marker should be present");

    const transPart = glassPart.substring(0, searchIdx);
    const rules = transPart.split("}").map(r => r.trim()).filter(Boolean);

    let unscopedCount = 0;
    const unscopedSelectors: string[] = [];

    for (const rule of rules) {
        if (rule.startsWith("/*")) continue;
        const sel = rule.split("{")[0].trim();
        const selectors = sel.split(",").map(s => s.trim()).filter(Boolean);
        for (const s of selectors) {
            if (!s.startsWith("html.vc-has-active-theme")) {
                unscopedCount++;
                unscopedSelectors.push(s);
            }
        }
    }

    assert.equal(unscopedCount, 0, `All transparency rules must be scoped to html.vc-has-active-theme. Found unscoped: ${unscopedSelectors.join(", ")}`);
});

test("Theme Scoping - Vanilla Discord preservation when no theme is active", () => {
    const jsPath = path.join(__dirname, "../vencord/dist/renderer.js");
    assert.ok(fs.existsSync(jsPath), "renderer.js should exist");
    const js = fs.readFileSync(jsPath, "utf8");

    assert.ok(js.includes("function _syncActiveThemeClass"), "_syncActiveThemeClass function should be defined");
    assert.ok(js.includes("_syncActiveThemeClass(i)"), "Ea() should call _syncActiveThemeClass(i)");
    assert.ok(js.includes("vc-has-active-theme"), "Class vc-has-active-theme should be toggled dynamically");
});

test("Voice Chat Transparency - All required voice elements and user boxes are covered", () => {
    const cssPath = path.join(__dirname, "../vencord/dist/renderer.css");
    const css = fs.readFileSync(cssPath, "utf8");

    // Connected voice chat
    assert.ok(css.includes('html.vc-has-active-theme [class*="callContainer_"]'), "Call container should be transparent");
    assert.ok(css.includes('html.vc-has-active-theme [class*="videoGrid_"]'), "Video grid should be transparent");

    // User boxes and participant tiles
    assert.ok(css.includes('html.vc-has-active-theme [class*="tile_"]'), "User boxes / tiles should be targeted");
    assert.ok(css.includes('html.vc-has-active-theme [class*="tileChild_"]'), "Tile child elements should be targeted");
    assert.ok(css.includes('html.vc-has-active-theme [class*="userTile_"]'), "User tiles should be targeted");
    assert.ok(css.includes('html.vc-has-active-theme [class*="tile_"] [class*="background_"]'), "Inner tile solid backgrounds should be cleared");

    // Voice box when not connected
    assert.ok(css.includes('html.vc-has-active-theme [class*="voiceChannel_"]'), "Voice channel view when not connected should be transparent");
    assert.ok(css.includes('html.vc-has-active-theme [class*="voiceChannel_"] [class*="card_"]'), "Voice box cards should be glass styled");
    assert.ok(css.includes('html.vc-has-active-theme [class*="voiceUsers_"]'), "Voice channel users list should be transparent");
    assert.ok(css.includes('html.vc-has-active-theme [class*="channelBottomBarArea"]'), "Channel bottom bar area should be transparent");
});

test("Theme Library - All 83 themes include voice transparency and user box styles", () => {
    const themeDir = path.join(__dirname, "../themes");
    const files = fs.readdirSync(themeDir).filter(f => f.endsWith(".theme.css"));
    assert.equal(files.length, 83, "Should have 83 themes");

    for (const file of files) {
        const content = fs.readFileSync(path.join(themeDir, file), "utf8");
        assert.ok(content.includes("#app-mount [class*=\"tile_\"] [class*=\"background_\"]"), `${file} should clear inner tile backgrounds`);
        assert.ok(content.includes("#app-mount [class*=\"voiceChannel_\"] [class*=\"card_\"]"), `${file} should style voice channel cards`);
        assert.ok(content.includes("#app-mount [class*=\"callContainer\"] [class*=\"tile_\"]"), `${file} should style user boxes`);
    }
});
