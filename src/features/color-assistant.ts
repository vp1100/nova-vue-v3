import { createRange, fullText } from "@/lsp/position";

interface ParsedColor {
  color: Color;
  kind: string;
  usesFloats?: boolean;
}

interface StyleBlock {
  start: number;
  end: number;
}

interface ColorMatch {
  start: number;
  end: number;
  text: string;
}

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const CSS_COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla)\(\s*[^)]*?\s*\)/gi;

export function registerColorAssistant(): Disposable[] {
  return [nova.assistants.registerColorAssistant("vue", new VueColorAssistant())];
}

class VueColorAssistant implements ColorAssistant {
  provideColors(editor: TextEditor, context: ColorInformationContext): ColorInformation[] {
    const text = fullText(editor);
    const styleBlocks = findStyleBlocks(text);
    if (styleBlocks.length === 0) {
      return [];
    }

    const matches = [
      ...matchesFromCandidates(context.candidates, styleBlocks),
      ...scanStyleBlocks(text, styleBlocks)
    ];
    const colors: ColorInformation[] = [];
    const seen = new Set<string>();

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

      const colorInfo = new ColorInformation(createRange(match.start, match.end), parsed.color, parsed.kind);
      if (parsed.usesFloats !== undefined) {
        colorInfo.usesFloats = parsed.usesFloats;
      }
      colors.push(colorInfo);
    }

    return colors;
  }

  provideColorPresentations(color: Color): ColorPresentation[] {
    const rgb = color.convert(ColorFormat.rgb).components;
    const hsl = color.convert(ColorFormat.hsl).components;
    const red = clamp(rgb[0] ?? 0, 0, 1);
    const green = clamp(rgb[1] ?? 0, 0, 1);
    const blue = clamp(rgb[2] ?? 0, 0, 1);
    const alpha = clamp(rgb[3] ?? 1, 0, 1);
    const hue = normalizeHue((hsl[0] ?? 0) * 360);
    const saturation = clamp(hsl[1] ?? 0, 0, 1);
    const luminance = clamp(hsl[2] ?? 0, 0, 1);
    const presentations: ColorPresentation[] = [];
    if (alpha >= 0.9995) {
      presentations.push(
        createPresentation(formatHex(red, green, blue), "hex", ColorFormat.rgb),
        createPresentation(formatRgb(red, green, blue), "rgb", ColorFormat.rgb),
        createPresentation(formatHsl(hue, saturation, luminance), "hsl", ColorFormat.hsl)
      );
    }
    presentations.push(
      createPresentation(formatHex(red, green, blue, alpha), "hexa", ColorFormat.rgb),
      createPresentation(formatRgb(red, green, blue, alpha), "rgba", ColorFormat.rgb),
      createPresentation(formatHsl(hue, saturation, luminance, alpha), "hsla", ColorFormat.hsl)
    );
    return presentations;
  }
}

function createPresentation(label: string, kind: string, format: ColorFormat): ColorPresentation {
  const presentation = new ColorPresentation(label, kind);
  presentation.format = format;
  presentation.usesFloats = false;
  return presentation;
}

function formatHex(red: number, green: number, blue: number, alpha?: number): string {
  const components = [red, green, blue, ...(alpha === undefined ? [] : [alpha])];
  return `#${components.map(toHexByte).join("")}`;
}

function toHexByte(value: number): string {
  return Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0");
}

function formatRgb(red: number, green: number, blue: number, alpha?: number): string {
  const components = [red, green, blue].map((value) => Math.round(clamp(value, 0, 1) * 255));
  if (alpha === undefined) {
    return `rgb(${components.join(", ")})`;
  }
  return `rgba(${components.join(", ")}, ${formatDecimal(alpha)})`;
}

function formatHsl(hue: number, saturation: number, luminance: number, alpha?: number): string {
  const components = `${formatDecimal(hue)}deg, ${formatDecimal(saturation * 100)}%, ${formatDecimal(luminance * 100)}%`;
  if (alpha === undefined) {
    return `hsl(${components})`;
  }
  return `hsla(${components}, ${formatDecimal(alpha)})`;
}

function formatDecimal(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function findStyleBlocks(text: string): StyleBlock[] {
  const blocks: StyleBlock[] = [];
  const styleBlock = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleBlock.exec(text)) !== null) {
    const openTagEnd = match.index + match[0].indexOf(">") + 1;
    const closeTagStart = openTagEnd + match[1].length;
    blocks.push({ start: openTagEnd, end: closeTagStart });
  }
  return blocks;
}

function matchesFromCandidates(candidates: ColorCandidate[], styleBlocks: StyleBlock[]): ColorMatch[] {
  const matches: ColorMatch[] = [];
  for (const candidate of candidates) {
    const range = candidate.range as unknown as { start: number; end: number };
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

function scanStyleBlocks(text: string, styleBlocks: StyleBlock[]): ColorMatch[] {
  return styleBlocks.flatMap((block) => [
    ...scanPattern(text, block, HEX_COLOR),
    ...scanPattern(text, block, CSS_COLOR_FUNCTION)
  ]).sort((a, b) => a.start - b.start || a.end - b.end);
}

function scanPattern(text: string, block: StyleBlock, pattern: RegExp): ColorMatch[] {
  const matches: ColorMatch[] = [];
  pattern.lastIndex = 0;
  const blockText = text.slice(block.start, block.end);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(blockText)) !== null) {
    matches.push({
      start: block.start + match.index,
      end: block.start + match.index + match[0].length,
      text: match[0]
    });
  }
  return matches;
}

function isInsideStyleBlock(start: number, end: number, styleBlocks: StyleBlock[]): boolean {
  return styleBlocks.some((block) => start >= block.start && end <= block.end);
}

function parseCssColor(value: string): ParsedColor | null {
  const text = value.trim();
  return parseHexColor(text) ?? parseRgbColor(text) ?? parseHslColor(text);
}

function parseHexColor(value: string): ParsedColor | null {
  const match = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
  if (!match) {
    return null;
  }

  const hex = match[1];
  const hasAlpha = hex.length === 4 || hex.length === 8;
  const expanded = hex.length <= 4
    ? [...hex].map((character) => `${character}${character}`).join("")
    : hex;
  const red = parseInt(expanded.slice(0, 2), 16) / 255;
  const green = parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = parseInt(expanded.slice(4, 6), 16) / 255;
  const alpha = hasAlpha ? parseInt(expanded.slice(6, 8), 16) / 255 : 1;

  return {
    color: Color.rgb(red, green, blue, alpha),
    kind: hasAlpha ? "hexa" : "hex"
  };
}

function parseRgbColor(value: string): ParsedColor | null {
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

function parseHslColor(value: string): ParsedColor | null {
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

function splitCssFunctionArgs(value: string): string[] {
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

function parseRgbComponent(value: string): number | null {
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

function parsePercent(value: string): number | null {
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

function parseAlpha(value: string): number | null {
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

function parseHue(value: string): number | null {
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

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
