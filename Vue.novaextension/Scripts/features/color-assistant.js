"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerColorAssistant = registerColorAssistant;
const position_1 = require("../lsp/position");
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const CSS_COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla)\(\s*[^)]*?\s*\)/gi;
function registerColorAssistant() {
    return [nova.assistants.registerColorAssistant("vue", new VueColorAssistant())];
}
class VueColorAssistant {
    provideColors(editor, context) {
        const text = (0, position_1.fullText)(editor);
        const styleBlocks = findStyleBlocks(text);
        if (styleBlocks.length === 0) {
            return [];
        }
        const matches = [
            ...matchesFromCandidates(context.candidates, styleBlocks),
            ...scanStyleBlocks(text, styleBlocks)
        ];
        const colors = [];
        const seen = new Set();
        for (const match of matches) {
            const key = `${match.start}:${match.end}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const parsed = parseCssColor(match.text);
            if (!parsed) {
                continue;
            }
            const colorInfo = new ColorInformation((0, position_1.createRange)(match.start, match.end), parsed.color, parsed.kind);
            if (parsed.usesFloats !== undefined) {
                colorInfo.usesFloats = parsed.usesFloats;
            }
            colors.push(colorInfo);
        }
        return colors;
    }
}
function findStyleBlocks(text) {
    const blocks = [];
    const styleBlock = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleBlock.exec(text)) !== null) {
        const openTagEnd = match.index + match[0].indexOf(">") + 1;
        const closeTagStart = openTagEnd + match[1].length;
        blocks.push({ start: openTagEnd, end: closeTagStart });
    }
    return blocks;
}
function matchesFromCandidates(candidates, styleBlocks) {
    const matches = [];
    for (const candidate of candidates) {
        const range = candidate.range;
        if (!isInsideStyleBlock(range.start, range.end, styleBlocks)) {
            continue;
        }
        matches.push({
            start: range.start,
            end: range.end,
            text: candidate.text
        });
    }
    return matches;
}
function scanStyleBlocks(text, styleBlocks) {
    return styleBlocks.flatMap((block) => [
        ...scanPattern(text, block, HEX_COLOR),
        ...scanPattern(text, block, CSS_COLOR_FUNCTION)
    ]).sort((a, b) => a.start - b.start || a.end - b.end);
}
function scanPattern(text, block, pattern) {
    const matches = [];
    pattern.lastIndex = 0;
    const blockText = text.slice(block.start, block.end);
    let match;
    while ((match = pattern.exec(blockText)) !== null) {
        matches.push({
            start: block.start + match.index,
            end: block.start + match.index + match[0].length,
            text: match[0]
        });
    }
    return matches;
}
function isInsideStyleBlock(start, end, styleBlocks) {
    return styleBlocks.some((block) => start >= block.start && end <= block.end);
}
function parseCssColor(value) {
    const text = value.trim();
    return parseHexColor(text) ?? parseRgbColor(text) ?? parseHslColor(text);
}
function parseHexColor(value) {
    const match = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
    if (!match) {
        return null;
    }
    const hex = match[1];
    const expanded = hex.length <= 4
        ? [...hex].map((character) => `${character}${character}`).join("")
        : hex;
    const red = parseInt(expanded.slice(0, 2), 16) / 255;
    const green = parseInt(expanded.slice(2, 4), 16) / 255;
    const blue = parseInt(expanded.slice(4, 6), 16) / 255;
    const alpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return {
        color: Color.rgb(red, green, blue, alpha),
        kind: alpha < 1 ? "hexa" : "hex"
    };
}
function parseRgbColor(value) {
    const match = /^rgba?\((.*)\)$/i.exec(value);
    if (!match) {
        return null;
    }
    const parts = splitCssFunctionArgs(match[1]);
    if (parts.length < 3 || parts.length > 4) {
        return null;
    }
    const red = parseRgbComponent(parts[0]);
    const green = parseRgbComponent(parts[1]);
    const blue = parseRgbComponent(parts[2]);
    const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
    if (red === null || green === null || blue === null || alpha === null) {
        return null;
    }
    const usesFloats = parts.slice(0, 3).some((part) => !part.trim().endsWith("%") && part.includes("."));
    return {
        color: Color.rgb(red, green, blue, alpha),
        kind: alpha < 1 || /^rgba/i.test(value) ? "rgba" : "rgb",
        usesFloats
    };
}
function parseHslColor(value) {
    const match = /^hsla?\((.*)\)$/i.exec(value);
    if (!match) {
        return null;
    }
    const parts = splitCssFunctionArgs(match[1]);
    if (parts.length < 3 || parts.length > 4) {
        return null;
    }
    const hue = parseHue(parts[0]);
    const saturation = parsePercent(parts[1]);
    const luminance = parsePercent(parts[2]);
    const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
    if (hue === null || saturation === null || luminance === null || alpha === null) {
        return null;
    }
    return {
        color: Color.hsl(hue / 360, saturation, luminance, alpha),
        kind: alpha < 1 || /^hsla/i.test(value) ? "hsla" : "hsl"
    };
}
function splitCssFunctionArgs(value) {
    const normalized = value.trim();
    const slashParts = normalized.split(/\s*\/\s*/);
    const valuePart = slashParts[0] ?? "";
    const alphaPart = slashParts[1];
    if (valuePart.includes(",")) {
        const parts = valuePart.split(",").map((part) => part.trim()).filter(Boolean);
        if (alphaPart) {
            parts.push(alphaPart.trim());
        }
        return parts;
    }
    const parts = valuePart.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    if (alphaPart) {
        parts.push(alphaPart.trim());
    }
    return parts;
}
function parseRgbComponent(value) {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
        return parsePercent(trimmed);
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return clamp(numeric / 255, 0, 1);
}
function parsePercent(value) {
    const trimmed = value.trim();
    if (!trimmed.endsWith("%")) {
        return null;
    }
    const numeric = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return clamp(numeric / 100, 0, 1);
}
function parseAlpha(value) {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
        return parsePercent(trimmed);
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return clamp(numeric, 0, 1);
}
function parseHue(value) {
    const trimmed = value.trim().toLowerCase();
    const numeric = Number(trimmed.replace(/(?:deg|rad|turn)$/, ""));
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (trimmed.endsWith("rad")) {
        return normalizeHue((numeric * 180) / Math.PI);
    }
    if (trimmed.endsWith("turn")) {
        return normalizeHue(numeric * 360);
    }
    return normalizeHue(numeric);
}
function normalizeHue(value) {
    return ((value % 360) + 360) % 360;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
