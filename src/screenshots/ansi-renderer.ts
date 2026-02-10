// Athena - ANSI to SVG Renderer
// Copyright 2026, TheForge, LLC
//
// Renders terminal output (with ANSI escape codes) to SVG images.
// No external dependencies - pure SVG generation.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Standard terminal color palette (xterm-256 base 16)
const COLORS: Record<number, string> = {
  0: "#282c34", // black
  1: "#e06c75", // red
  2: "#98c379", // green
  3: "#e5c07b", // yellow
  4: "#61afef", // blue
  5: "#c678dd", // magenta
  6: "#56b6c2", // cyan
  7: "#abb2bf", // white
  // Bright variants
  8: "#545862", // bright black
  9: "#e06c75", // bright red
  10: "#98c379", // bright green
  11: "#e5c07b", // bright yellow
  12: "#61afef", // bright blue
  13: "#c678dd", // bright magenta
  14: "#56b6c2", // bright cyan
  15: "#c8ccd4", // bright white
};

// Light theme colors
const LIGHT_COLORS: Record<number, string> = {
  0: "#383a42", // black
  1: "#e45649", // red
  2: "#50a14f", // green
  3: "#c18401", // yellow
  4: "#4078f2", // blue
  5: "#a626a4", // magenta
  6: "#0184bc", // cyan
  7: "#a0a1a7", // white
  8: "#696c77", // bright black
  9: "#e45649",
  10: "#50a14f",
  11: "#c18401",
  12: "#4078f2",
  13: "#a626a4",
  14: "#0184bc",
  15: "#383a42",
};

interface RenderOptions {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  width?: number;
  padding?: number;
  theme?: "dark" | "light";
  title?: string;
}

interface TextSpan {
  text: string;
  fg?: string;
  bg?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
}

interface ParsedLine {
  spans: TextSpan[];
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.5,
  width: 820,
  padding: 20,
  theme: "dark",
  title: "",
};

/**
 * Render ANSI text to an SVG string.
 */
export function renderAnsiToSvg(
  ansiText: string,
  options?: RenderOptions
): string {
  // Filter out undefined values so defaults aren't overwritten
  const defined: Record<string, unknown> = {};
  if (options) {
    for (const [k, v] of Object.entries(options)) {
      if (v !== undefined) defined[k] = v;
    }
  }
  const opts = { ...DEFAULT_OPTIONS, ...defined } as Required<RenderOptions>;
  const palette = opts.theme === "light" ? LIGHT_COLORS : COLORS;
  const bgColor = opts.theme === "light" ? "#fafafa" : "#282c34";
  const fgColor = opts.theme === "light" ? "#383a42" : "#abb2bf";
  const titleBarColor = opts.theme === "light" ? "#e8e8e8" : "#21252b";

  const lines = parseAnsiText(ansiText, palette, fgColor);
  const lineHeightPx = opts.fontSize * opts.lineHeight;

  // Title bar height
  const titleBarHeight = opts.title ? 36 : 0;
  // Terminal dot buttons height
  const dotsHeight = 36;

  const contentHeight = lines.length * lineHeightPx;
  const totalHeight =
    dotsHeight + titleBarHeight + contentHeight + opts.padding * 2;
  const totalWidth = opts.width;

  const svgParts: string[] = [];

  // SVG header
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`
  );

  // Styles
  svgParts.push(`<style>
    .terminal-text {
      font-family: ${opts.fontFamily};
      font-size: ${opts.fontSize}px;
      line-height: ${opts.lineHeight};
      white-space: pre;
    }
    .bold { font-weight: bold; }
    .italic { font-style: italic; }
    .underline { text-decoration: underline; }
    .dim { opacity: 0.5; }
  </style>`);

  // Background with rounded corners
  svgParts.push(
    `<rect width="${totalWidth}" height="${totalHeight}" rx="8" ry="8" fill="${bgColor}" />`
  );

  // Title bar / window chrome
  if (opts.title) {
    svgParts.push(
      `<rect width="${totalWidth}" height="${dotsHeight + titleBarHeight}" rx="8" ry="8" fill="${titleBarColor}" />`
    );
    svgParts.push(
      `<rect y="${dotsHeight + titleBarHeight - 1}" width="${totalWidth}" height="1" fill="${bgColor}" />`
    );
  } else {
    svgParts.push(
      `<rect width="${totalWidth}" height="${dotsHeight}" rx="8" ry="8" fill="${titleBarColor}" />`
    );
    svgParts.push(
      `<rect y="${dotsHeight - 1}" width="${totalWidth}" height="1" fill="${bgColor}" />`
    );
  }

  // Window dots (macOS style)
  const dotY = 18;
  svgParts.push(`<circle cx="20" cy="${dotY}" r="6" fill="#ff5f56" />`);
  svgParts.push(`<circle cx="40" cy="${dotY}" r="6" fill="#ffbd2e" />`);
  svgParts.push(`<circle cx="60" cy="${dotY}" r="6" fill="#27c93f" />`);

  // Title text
  if (opts.title) {
    svgParts.push(
      `<text x="${totalWidth / 2}" y="${dotY + titleBarHeight - 4}" text-anchor="middle" fill="${fgColor}" font-family="${opts.fontFamily}" font-size="${opts.fontSize}px" opacity="0.7">${escapeXml(opts.title)}</text>`
    );
  }

  // Terminal content
  const contentY = dotsHeight + titleBarHeight + opts.padding;
  const contentX = opts.padding;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = contentY + i * lineHeightPx + opts.fontSize;
    let x = contentX;

    for (const span of line.spans) {
      if (span.text.length === 0) continue;

      const classes: string[] = ["terminal-text"];
      if (span.bold) classes.push("bold");
      if (span.italic) classes.push("italic");
      if (span.underline) classes.push("underline");
      if (span.dim) classes.push("dim");

      const fill = span.fg ?? fgColor;
      const escapedText = escapeXml(span.text);

      // Background highlight
      if (span.bg) {
        const charWidth = opts.fontSize * 0.6;
        const bgWidth = span.text.length * charWidth;
        svgParts.push(
          `<rect x="${x}" y="${y - opts.fontSize + 2}" width="${bgWidth}" height="${lineHeightPx}" fill="${span.bg}" />`
        );
      }

      svgParts.push(
        `<text x="${x}" y="${y}" class="${classes.join(" ")}" fill="${fill}">${escapedText}</text>`
      );

      // Advance x position (approximate monospace width)
      x += span.text.length * opts.fontSize * 0.6;
    }
  }

  svgParts.push("</svg>");
  return svgParts.join("\n");
}

/**
 * Parse ANSI escape sequences and produce styled text spans per line.
 */
function parseAnsiText(
  text: string,
  palette: Record<number, string>,
  defaultFg: string
): ParsedLine[] {
  // Strip carriage returns
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = cleaned.split("\n");

  // Limit to reasonable number of lines
  const maxLines = 80;
  const lines = rawLines.slice(0, maxLines);

  let currentFg: string | undefined;
  let currentBg: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let dim = false;

  const parsedLines: ParsedLine[] = [];

  for (const rawLine of lines) {
    const spans: TextSpan[] = [];
    let buffer = "";

    // Parse ANSI escape sequences
    let i = 0;
    while (i < rawLine.length) {
      // ESC[...m (SGR sequences)
      if (rawLine[i] === "\x1b" && rawLine[i + 1] === "[") {
        // Flush current buffer
        if (buffer) {
          spans.push({
            text: buffer,
            fg: currentFg,
            bg: currentBg,
            bold,
            italic,
            underline,
            dim,
          });
          buffer = "";
        }

        // Find end of escape sequence
        let j = i + 2;
        while (j < rawLine.length && rawLine[j] !== "m" && rawLine[j] !== "H" && rawLine[j] !== "J" && rawLine[j] !== "K" && rawLine[j] !== "A" && rawLine[j] !== "B" && rawLine[j] !== "C" && rawLine[j] !== "D") {
          j++;
        }

        if (j < rawLine.length && rawLine[j] === "m") {
          const params = rawLine.slice(i + 2, j);
          applyAnsiParams(params, palette, defaultFg, (state) => {
            currentFg = state.fg;
            currentBg = state.bg;
            bold = state.bold;
            italic = state.italic;
            underline = state.underline;
            dim = state.dim;
          }, { fg: currentFg, bg: currentBg, bold, italic, underline, dim });
        }

        i = j + 1;
      } else if (rawLine.charCodeAt(i) < 32 && rawLine[i] !== "\t") {
        // Skip other control characters
        i++;
      } else {
        // Replace tabs with spaces
        if (rawLine[i] === "\t") {
          buffer += "    ";
        } else {
          buffer += rawLine[i];
        }
        i++;
      }
    }

    // Flush remaining buffer
    if (buffer) {
      spans.push({
        text: buffer,
        fg: currentFg,
        bg: currentBg,
        bold,
        italic,
        underline,
        dim,
      });
    }

    // Ensure empty lines have at least one span
    if (spans.length === 0) {
      spans.push({ text: "", fg: undefined, bg: undefined, bold: false, italic: false, underline: false, dim: false });
    }

    parsedLines.push({ spans });
  }

  // Trim trailing empty lines
  while (parsedLines.length > 0) {
    const last = parsedLines[parsedLines.length - 1];
    if (last.spans.length === 1 && last.spans[0].text === "") {
      parsedLines.pop();
    } else {
      break;
    }
  }

  return parsedLines;
}

/**
 * Apply ANSI SGR parameters to current text state.
 */
function applyAnsiParams(
  params: string,
  palette: Record<number, string>,
  defaultFg: string,
  apply: (state: { fg?: string; bg?: string; bold: boolean; italic: boolean; underline: boolean; dim: boolean }) => void,
  current: { fg?: string; bg?: string; bold: boolean; italic: boolean; underline: boolean; dim: boolean }
): void {
  const codes = params.split(";").map(Number);
  const state = { ...current };

  let i = 0;
  while (i < codes.length) {
    const code = codes[i];

    if (code === 0 || isNaN(code)) {
      // Reset
      state.fg = undefined;
      state.bg = undefined;
      state.bold = false;
      state.italic = false;
      state.underline = false;
      state.dim = false;
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 3) {
      state.italic = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) {
      state.italic = false;
    } else if (code === 24) {
      state.underline = false;
    } else if (code >= 30 && code <= 37) {
      // Standard foreground colors
      state.fg = palette[code - 30];
    } else if (code === 38) {
      // Extended foreground: 38;5;n (256-color) or 38;2;r;g;b (truecolor)
      if (codes[i + 1] === 5 && i + 2 < codes.length) {
        state.fg = get256Color(codes[i + 2], palette);
        i += 2;
      } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
        state.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    } else if (code === 39) {
      state.fg = undefined;
    } else if (code >= 40 && code <= 47) {
      // Standard background colors
      state.bg = palette[code - 40];
    } else if (code === 48) {
      // Extended background
      if (codes[i + 1] === 5 && i + 2 < codes.length) {
        state.bg = get256Color(codes[i + 2], palette);
        i += 2;
      } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
        state.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    } else if (code === 49) {
      state.bg = undefined;
    } else if (code >= 90 && code <= 97) {
      // Bright foreground
      state.fg = palette[code - 90 + 8];
    } else if (code >= 100 && code <= 107) {
      // Bright background
      state.bg = palette[code - 100 + 8];
    }

    i++;
  }

  apply(state);
}

/**
 * Get a color from the 256-color palette.
 */
function get256Color(n: number, palette: Record<number, string>): string {
  if (n < 16) {
    return palette[n] ?? "#abb2bf";
  }

  // Colors 16-231: 6x6x6 color cube
  if (n < 232) {
    const idx = n - 16;
    const b = idx % 6;
    const g = Math.floor(idx / 6) % 6;
    const r = Math.floor(idx / 36);
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${toHex(r)},${toHex(g)},${toHex(b)})`;
  }

  // Colors 232-255: grayscale
  const gray = 8 + (n - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render ANSI text to SVG and write to disk.
 */
export async function renderToSvgFile(
  ansiText: string,
  outputPath: string,
  options?: RenderOptions
): Promise<void> {
  const svg = renderAnsiToSvg(ansiText, options);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, svg, "utf-8");
}
