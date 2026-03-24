// Athena - Mermaid Renderer (mermaid-cli integration)
// Copyright 2026, Forgeborn

import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

export type OutputFormat = "png" | "svg" | "both";

export interface RenderResult {
  name: string;
  format: string;
  outputPath: string;
  success: boolean;
  error?: string;
}

/**
 * Render Mermaid code to PNG and/or SVG using @mermaid-js/mermaid-cli (mmdc).
 * Falls back gracefully if mermaid-cli is not installed.
 */
export async function renderMermaid(
  mermaidCode: string,
  name: string,
  outputDir: string,
  format: OutputFormat = "both"
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  await mkdir(outputDir, { recursive: true });

  const mmdcPath = await findMmdc();
  if (!mmdcPath) {
    // Return error results indicating CLI not found
    const formats = format === "both" ? ["png", "svg"] : [format];
    for (const fmt of formats) {
      results.push({
        name,
        format: fmt,
        outputPath: "",
        success: false,
        error: "@mermaid-js/mermaid-cli not installed. Run: npm install -g @mermaid-js/mermaid-cli",
      });
    }
    return results;
  }

  // Write Mermaid code to a temp file
  const tmpFile = join(tmpdir(), `athena-mermaid-${Date.now()}-${name}.mmd`);
  await writeFile(tmpFile, mermaidCode, "utf-8");

  try {
    const formats = format === "both" ? ["png", "svg"] : [format];

    for (const fmt of formats) {
      const outputPath = join(outputDir, `${name}.${fmt}`);

      try {
        await execFileAsync(mmdcPath, [
          "-i", tmpFile,
          "-o", outputPath,
          "-b", "transparent",
          "--quiet",
        ], {
          timeout: 30000,
        });

        results.push({
          name,
          format: fmt,
          outputPath,
          success: existsSync(outputPath),
          error: existsSync(outputPath) ? undefined : "Output file not created",
        });
      } catch (err) {
        results.push({
          name,
          format: fmt,
          outputPath,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    // Clean up temp file
    try {
      await unlink(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }

  return results;
}

/**
 * Render multiple Mermaid diagrams in batch.
 */
export async function renderMermaidBatch(
  diagrams: Array<{ name: string; code: string }>,
  outputDir: string,
  format: OutputFormat = "both"
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  for (const diagram of diagrams) {
    const diagramResults = await renderMermaid(
      diagram.code,
      diagram.name,
      outputDir,
      format
    );
    results.push(...diagramResults);
  }

  return results;
}

/**
 * Find the mmdc (mermaid-cli) binary.
 */
async function findMmdc(): Promise<string | null> {
  // Check common locations
  const candidates = [
    "mmdc",                                           // Global PATH
    "npx mmdc",                                       // Via npx
    join(process.cwd(), "node_modules", ".bin", "mmdc"),  // Local project
  ];

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("npx")) {
        // Test npx availability
        await execFileAsync("npx", ["mmdc", "--version"], { timeout: 10000 });
        return "npx";
      } else {
        await execFileAsync(candidate, ["--version"], { timeout: 5000 });
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Check if mermaid-cli is available.
 */
export async function isMermaidCliAvailable(): Promise<boolean> {
  const mmdcPath = await findMmdc();
  return mmdcPath !== null;
}
