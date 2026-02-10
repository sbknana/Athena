// Athena - Main Documentation Generator
// Copyright 2026, TheForge, LLC

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ClaudeClient } from "./claude-client.js";
import { SYSTEM_PROMPTS, buildUserPrompt } from "./prompts.js";
import {
  buildSourceSummary,
  formatScreenshotEmbed,
  generateTableOfContents,
  parseMarkdownSections,
  buildCrossReferences,
} from "../utils/doc-helpers.js";
import { diffWithExisting, mergeBySection } from "../utils/diff.js";
import type {
  DocGeneratorConfig,
  DocType,
  GeneratedDoc,
  DiffResult,
  DocGenerationResult,
  ProjectManifest,
  ScreenshotManifest,
} from "../types.js";

const DOC_FILENAMES: Record<DocType, string> = {
  readme: "README.md",
  architecture: "ARCHITECTURE.md",
  api: "API.md",
  deployment: "DEPLOYMENT.md",
  contributing: "CONTRIBUTING.md",
};

export class DocGenerator {
  private client: ClaudeClient;
  private config: DocGeneratorConfig;

  constructor(config: DocGeneratorConfig) {
    this.config = config;
    this.client = new ClaudeClient(config.model, config.apiKey);
  }

  async generate(manifest: ProjectManifest): Promise<DocGenerationResult> {
    const sourceSummary = buildSourceSummary(manifest);
    const screenshotSection = this.buildScreenshotSection();

    await mkdir(this.config.outputDir, { recursive: true });

    const docs: GeneratedDoc[] = [];
    const diffs: DiffResult[] = [];

    // Generate docs sequentially to respect API rate limits
    for (const docType of this.config.docs) {
      console.log(`  Generating ${DOC_FILENAMES[docType]}...`);

      const doc = await this.generateSingleDoc(
        docType,
        sourceSummary,
        screenshotSection
      );
      docs.push(doc);
    }

    // Add cross-references to each doc
    const crossRefDocs = docs.map((d) => ({
      type: d.type,
      filename: d.filename,
    }));

    for (const doc of docs) {
      const otherDocs = crossRefDocs.filter((d) => d.type !== doc.type);
      if (otherDocs.length > 0) {
        doc.content += "\n" + buildCrossReferences(otherDocs);
        doc.sections = parseMarkdownSections(doc.content);
      }
    }

    // Add table of contents to docs with more than 4 sections
    for (const doc of docs) {
      if (doc.sections.length > 4) {
        const toc = generateTableOfContents(doc.sections);
        // Insert TOC after the first H1
        const firstH1End = doc.content.indexOf("\n\n");
        if (firstH1End !== -1) {
          doc.content =
            doc.content.slice(0, firstH1End + 2) +
            toc +
            "\n" +
            doc.content.slice(firstH1End + 2);
          doc.sections = parseMarkdownSections(doc.content);
        }
      }
    }

    // Diff with existing and write files
    for (const doc of docs) {
      const diff = await diffWithExisting(
        this.config.outputDir,
        doc.filename,
        doc.content
      );
      diffs.push(diff);

      if (this.config.diffMode && !diff.hasChanges) {
        console.log(`  ${doc.filename}: no changes, skipping write`);
        continue;
      }

      if (this.config.diffMode && diff.hasChanges) {
        // In diff mode, merge by section to preserve manual edits
        try {
          const existing = await readFile(
            join(this.config.outputDir, doc.filename),
            "utf-8"
          );
          doc.content = mergeBySection(existing, doc.content);
        } catch {
          // File doesn't exist, use generated content as-is
        }
      }

      const outPath = join(this.config.outputDir, doc.filename);
      await writeFile(outPath, doc.content, "utf-8");
      const changeNote = diff.hasChanges
        ? ` (+${diff.addedLines}/-${diff.removedLines} lines)`
        : "";
      console.log(`  Wrote ${outPath}${changeNote}`);
    }

    return {
      docs,
      diffs,
      model: this.client.getModelName(),
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateSingleDoc(
    docType: DocType,
    sourceSummary: string,
    screenshotSection: string
  ): Promise<GeneratedDoc> {
    const systemPrompt = SYSTEM_PROMPTS[docType];
    const userPrompt = buildUserPrompt(sourceSummary, screenshotSection, docType);

    const content = await this.client.generate(systemPrompt, userPrompt);
    const sections = parseMarkdownSections(content);

    return {
      type: docType,
      filename: DOC_FILENAMES[docType],
      content,
      sections,
    };
  }

  private buildScreenshotSection(): string {
    const manifest = this.config.screenshotManifest;
    if (!manifest || manifest.screenshots.length === 0) {
      return "";
    }

    const lines: string[] = [];
    for (const screenshot of manifest.screenshots) {
      lines.push(
        `- ${screenshot.path}: ${screenshot.description || screenshot.route || "screenshot"}`
      );
    }
    return lines.join("\n");
  }
}

export async function loadManifest(
  projectDir: string
): Promise<ProjectManifest> {
  const manifestPath = join(projectDir, "project-manifest.json");
  const raw = await readFile(manifestPath, "utf-8");
  return JSON.parse(raw) as ProjectManifest;
}

export async function loadScreenshotManifest(
  projectDir: string
): Promise<ScreenshotManifest | undefined> {
  const manifestPath = join(projectDir, "docs", "screenshot-manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as ScreenshotManifest;
  } catch {
    return undefined;
  }
}

export function printDiffSummary(diffs: DiffResult[]): void {
  console.log("\n--- Diff Summary ---");
  for (const diff of diffs) {
    if (diff.hasChanges) {
      console.log(
        `  ${diff.filename}: +${diff.addedLines}/-${diff.removedLines} lines changed`
      );
    } else {
      console.log(`  ${diff.filename}: unchanged`);
    }
  }
}
