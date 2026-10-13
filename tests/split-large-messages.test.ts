import test from "node:test";
import assert from "node:assert/strict";

/**
 * Smart message splitting algorithm used by SplitLargeMessages plugin.
 * Mirrors the production implementation in vencord/dist/renderer.js.
 */
export function splitMessageSmart(text: string, maxLen: number = 1950): string[] {
    if (!text || text.length <= maxLen) return [text];

    function adjustSplitForUnicode(str: string, idx: number): number {
        if (idx <= 0) return idx;
        if (idx >= str.length) return str.length;
        const prevCode = str.charCodeAt(idx - 1);
        if (prevCode >= 0xd800 && prevCode <= 0xdbff) {
            idx--;
        }
        if (idx > 0 && (str.charCodeAt(idx - 1) === 0x200d || str.charCodeAt(idx - 1) === 0xfe0f)) {
            idx--;
            if (idx > 1 && str.charCodeAt(idx - 2) >= 0xdc00 && str.charCodeAt(idx - 2) <= 0xdfff) {
                idx -= 2;
            }
        }
        return idx;
    }

    const chunks: string[] = [];
    let remaining = text;
    let inCodeBlock = false;
    let codeLanguage = "";

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        const budget = inCodeBlock ? maxLen - 6 : maxLen;
        let splitIdx = -1;

        // 1. Prefer paragraph break "\n\n"
        const pIdx = remaining.lastIndexOf("\n\n", budget);
        if (pIdx > budget * 0.3) {
            splitIdx = pIdx + 2;
        }

        // 2. Prefer line break "\n"
        if (splitIdx === -1) {
            const nIdx = remaining.lastIndexOf("\n", budget);
            if (nIdx > budget * 0.3) {
                splitIdx = nIdx + 1;
            }
        }

        // 3. Prefer word boundary " "
        if (splitIdx === -1) {
            const sIdx = remaining.lastIndexOf(" ", budget);
            if (sIdx > budget * 0.3) {
                splitIdx = sIdx + 1;
            }
        }

        // 4. Fallback: hard cut at budget avoiding broken Unicode/surrogates
        if (splitIdx === -1) {
            splitIdx = adjustSplitForUnicode(remaining, budget);
            if (splitIdx <= 0) splitIdx = budget;
        }

        let chunk = remaining.slice(0, splitIdx);
        remaining = remaining.slice(splitIdx);

        // Track Markdown code blocks
        const fenceMatches = [...chunk.matchAll(/```([a-zA-Z0-9_-]*)/g)];
        for (const match of fenceMatches) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeLanguage = match[1] || "";
            } else {
                inCodeBlock = false;
                codeLanguage = "";
            }
        }

        if (inCodeBlock) {
            chunk += "\n```";
            remaining = "```" + codeLanguage + "\n" + remaining;
        }

        chunks.push(chunk);
    }

    return chunks;
}

test("SplitLargeMessages - Messages <= 2000 chars remain unsplit", () => {
    // 1999 characters
    const msg1999 = "A".repeat(1999);
    const result1999 = splitMessageSmart(msg1999, 2000);
    assert.strictEqual(result1999.length, 1);
    assert.strictEqual(result1999[0], msg1999);

    // 2000 characters exact
    const msg2000 = "B".repeat(2000);
    assert.strictEqual(splitMessageSmart(msg2000, 2000).length, 1);
    assert.strictEqual(splitMessageSmart(msg2000, 2000)[0], msg2000);
});

test("SplitLargeMessages - Message with 2,001 characters splits into 2 valid parts", () => {
    const msg2001 = "Hello world! ".repeat(153) + "Final words."; // ~2001 chars
    const chunks = splitMessageSmart(msg2001, 1950);

    assert.strictEqual(chunks.length, 2);
    for (let i = 0; i < chunks.length; i++) {
        assert.ok(chunks[i].length <= 1950, `Chunk ${i} length ${chunks[i].length} exceeds 1950`);
        assert.ok(chunks[i].length > 0, `Chunk ${i} is empty`);
    }
    // Rejoined message preserves complete content
    assert.strictEqual(chunks.join(""), msg2001);
});

test("SplitLargeMessages - Message with 4,000 characters splits sequentially", () => {
    const msg4000 = "Sentence number one. Sentence number two. ".repeat(95); // ~3990 chars
    const chunks = splitMessageSmart(msg4000, 1950);

    assert.ok(chunks.length >= 2 && chunks.length <= 3);
    for (let i = 0; i < chunks.length; i++) {
        assert.ok(chunks[i].length <= 1950, `Chunk ${i} length ${chunks[i].length} exceeds limit`);
    }
    assert.strictEqual(chunks.join(""), msg4000);
});

test("SplitLargeMessages - Very large message with 10,000 characters splits correctly", () => {
    const msg10000 = "This is a detailed paragraph explaining an issue.\n\n".repeat(200); // 10,200 chars
    const chunks = splitMessageSmart(msg10000, 1950);

    assert.ok(chunks.length >= 5 && chunks.length <= 7);
    for (let i = 0; i < chunks.length; i++) {
        assert.ok(chunks[i].length <= 1950, `Chunk ${i} length ${chunks[i].length} exceeds 1950`);
    }
    assert.strictEqual(chunks.join(""), msg10000);
});

test("SplitLargeMessages - Splitting prefers paragraph breaks and line breaks", () => {
    const p1 = "P".repeat(1200);
    const p2 = "Q".repeat(1200);
    const text = p1 + "\n\n" + p2;

    const chunks = splitMessageSmart(text, 1950);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0], p1 + "\n\n");
    assert.strictEqual(chunks[1], p2);
});

test("SplitLargeMessages - Long unbroken string safely sliced without error", () => {
    const unbroken = "Z".repeat(5500);
    const chunks = splitMessageSmart(unbroken, 1950);

    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].length, 1950);
    assert.strictEqual(chunks[1].length, 1950);
    assert.strictEqual(chunks[2].length, 1600);
    assert.strictEqual(chunks.join(""), unbroken);
});

test("SplitLargeMessages - Unicode and emojis: no broken surrogate pairs", () => {
    // Construct message with surrogate emoji right at boundary
    const padding = "E".repeat(1949);
    const emoji = "🚀"; // 2 UTF-16 code units (\uD83D\uDE80)
    const trailing = "🎉".repeat(50);
    const text = padding + emoji + trailing;

    const chunks = splitMessageSmart(text, 1950);
    assert.strictEqual(chunks.length, 2);

    // Ensure Chunk 0 does not end with high surrogate
    const lastCharCode = chunks[0].charCodeAt(chunks[0].length - 1);
    assert.ok(lastCharCode < 0xd800 || lastCharCode > 0xdbff, "Chunk 0 ended with trailing high surrogate!");

    // Ensure Chunk 1 begins with the intact emoji
    assert.ok(chunks[1].startsWith("🚀"), "Chunk 1 did not start with intact emoji!");
});

test("SplitLargeMessages - Markdown code fences are cleanly closed and reopened", () => {
    const header = "```typescript\n";
    const body = "const line = 'code line testing';\n".repeat(70); // ~2380 chars
    const footer = "```";
    const text = header + body + footer;

    const chunks = splitMessageSmart(text, 1200);
    assert.ok(chunks.length >= 2);

    // Chunk 0 must close fence with \n```
    assert.ok(chunks[0].endsWith("\n```"), `Chunk 0 does not end with code fence closure: ${chunks[0].slice(-15)}`);

    // Chunk 1 must reopen fence with ```typescript\n
    assert.ok(chunks[1].startsWith("```typescript\n"), `Chunk 1 does not start with reopened fence: ${chunks[1].slice(0, 20)}`);
});
