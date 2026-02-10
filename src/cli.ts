#!/usr/bin/env node
// Athena CLI - Project Scanner and Manifest Generator
// Copyright 2026, TheForge, LLC

import { Command } from "commander";
import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { scanProject } from "./scanner.js";
import {
  DocGenerator,
  loadManifest,
  loadScreenshotManifest,
  printDiffSummary,
} from "./generators/index.js";
import { generateChangelog } from "./changelog/index.js";
import { loadConfig, initConfig, hasConfig } from "./config.js";
import {
  checkFreshness,
  printFreshnessResult,
  hashSourceFiles,
  saveFreshnessRecord,
} from "./freshness.js";
import type { DocType, ModelTier } from "./types.js";

const program = new Command();

program
  .name("athena")
  .description("Project scanner and manifest generator for AI-assisted development")
  .version("1.0.0");

program
  .command("generate")
  .description("Scan a project directory and generate a project-manifest.json")
  .requiredOption("--project <path>", "Path to the project directory to scan")
  .option("--output <path>", "Output path for the manifest file (default: project-manifest.json in project dir)")
  .option("--pretty", "Pretty-print the JSON output", true)
  .option("--no-pretty", "Minify the JSON output")
  .action(async (options: { project: string; output?: string; pretty: boolean }) => {
    const projectDir = resolve(options.project);

    if (!existsSync(projectDir)) {
      console.error(`Error: Project directory does not exist: ${projectDir}`);
      process.exit(1);
    }

    try {
      const manifest = await scanProject(projectDir);

      const outputPath = options.output
        ? resolve(options.output)
        : join(projectDir, "project-manifest.json");

      const json = options.pretty
        ? JSON.stringify(manifest, null, 2)
        : JSON.stringify(manifest);

      await writeFile(outputPath, json + "\n", "utf-8");
      console.log(`\nManifest written to: ${outputPath}`);
      console.log(`  Framework: ${manifest.framework}`);
      console.log(`  Language: ${manifest.language}`);
      console.log(`  Routes: ${manifest.routes.length}`);
      console.log(`  API Endpoints: ${manifest.apiEndpoints.length}`);
      console.log(`  Components: ${manifest.components.length}`);
      console.log(`  Functions: ${manifest.functions.length}`);
      console.log(`  Classes: ${manifest.classes.length}`);
    } catch (err) {
      console.error("Error scanning project:", err);
      process.exit(1);
    }
  });

const ALL_DOC_TYPES: DocType[] = [
  "readme",
  "architecture",
  "api",
  "deployment",
  "contributing",
];

program
  .command("generate-docs")
  .description(
    "Generate documentation (README, ARCHITECTURE, API, DEPLOYMENT, CONTRIBUTING) using Claude API"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--output <path>",
    "Output directory for generated docs (default: <project>/docs)"
  )
  .option(
    "--docs <types>",
    "Comma-separated doc types to generate (readme,architecture,api,deployment,contributing)",
    "readme,architecture,api,deployment,contributing"
  )
  .option(
    "--model <tier>",
    "Model tier: 'speed' (Sonnet) or 'quality' (Opus)",
    "speed"
  )
  .option("--api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env)")
  .option(
    "--diff",
    "Only update changed sections, preserving manual edits",
    false
  )
  .option("--scan", "Run project scan before generating docs", false)
  .action(
    async (options: {
      project: string;
      output?: string;
      docs: string;
      model: string;
      apiKey?: string;
      diff: boolean;
      scan: boolean;
    }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      const outputDir = options.output
        ? resolve(options.output)
        : join(projectDir, "docs");

      // Validate doc types
      const requestedDocs = options.docs.split(",").map((d) => d.trim());
      for (const doc of requestedDocs) {
        if (!ALL_DOC_TYPES.includes(doc as DocType)) {
          console.error(
            `Error: Unknown doc type '${doc}'. Valid types: ${ALL_DOC_TYPES.join(", ")}`
          );
          process.exit(1);
        }
      }

      // Validate model tier
      if (options.model !== "speed" && options.model !== "quality") {
        console.error(
          "Error: --model must be 'speed' (Sonnet) or 'quality' (Opus)"
        );
        process.exit(1);
      }

      try {
        // Optionally run scan first
        if (options.scan) {
          console.log("Scanning project...");
          const manifest = await scanProject(projectDir);
          const manifestPath = join(projectDir, "project-manifest.json");
          await writeFile(
            manifestPath,
            JSON.stringify(manifest, null, 2) + "\n",
            "utf-8"
          );
          console.log(`Manifest written to: ${manifestPath}`);
        }

        // Load manifest
        console.log("Loading project manifest...");
        const manifest = await loadManifest(projectDir);

        // Load screenshot manifest if available
        const screenshotManifest = await loadScreenshotManifest(projectDir);
        if (screenshotManifest) {
          console.log(
            `Found ${screenshotManifest.screenshots.length} screenshots`
          );
        }

        // Generate docs
        console.log(
          `\nGenerating documentation (model: ${options.model})...`
        );
        const generator = new DocGenerator({
          model: options.model as ModelTier,
          apiKey: options.apiKey,
          outputDir,
          projectDir,
          docs: requestedDocs as DocType[],
          screenshotManifest,
          diffMode: options.diff,
        });

        const result = await generator.generate(manifest);

        // Print summary
        console.log(`\nGeneration complete!`);
        console.log(`  Model: ${result.model}`);
        console.log(`  Documents: ${result.docs.length}`);
        console.log(`  Output: ${outputDir}`);

        if (options.diff) {
          printDiffSummary(result.diffs);
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("project-manifest.json")
        ) {
          console.error(
            "Error: No project-manifest.json found. Run 'athena generate --project <path>' first, or use --scan."
          );
        } else {
          console.error("Error generating docs:", err);
        }
        process.exit(1);
      }
    }
  );

program
  .command("changelog")
  .description("Generate CHANGELOG.md (and optionally HISTORY.md) from git history")
  .requiredOption("--project <path>", "Path to the project directory (must be a git repo)")
  .option("--output <path>", "Output directory (default: project root)")
  .option("--history", "Also generate a detailed HISTORY.md", false)
  .option("--github-url <url>", "GitHub repo URL for linking PRs/issues (auto-detected from remote)")
  .option("--from <tag>", "Start from this tag (default: all history)")
  .option("--to <ref>", "End at this ref (default: HEAD)")
  .action(
    async (options: {
      project: string;
      output?: string;
      history: boolean;
      githubUrl?: string;
      from?: string;
      to?: string;
    }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(`Error: Project directory does not exist: ${projectDir}`);
        process.exit(1);
      }

      if (!existsSync(join(projectDir, ".git"))) {
        console.error(`Error: Not a git repository: ${projectDir}`);
        process.exit(1);
      }

      try {
        console.log(`\nGenerating changelog for: ${projectDir}`);
        const result = await generateChangelog({
          projectDir,
          outputDir: options.output,
          includeHistory: options.history,
          githubUrl: options.githubUrl,
          fromTag: options.from,
          toRef: options.to,
        });

        console.log(`\nChangelog generation complete!`);
        console.log(`  Commits: ${result.totalCommits}`);
        console.log(`  Versions: ${result.versions.length}`);
        console.log(`  CHANGELOG: ${result.changelogPath}`);
        if (result.historyPath) {
          console.log(`  HISTORY: ${result.historyPath}`);
        }
        if (result.githubUrl) {
          console.log(`  GitHub: ${result.githubUrl}`);
        }

        // Print version summary
        for (const v of result.versions) {
          const counts = [
            v.features.length && `${v.features.length} features`,
            v.fixes.length && `${v.fixes.length} fixes`,
            v.refactors.length && `${v.refactors.length} refactors`,
            v.breaking.length && `${v.breaking.length} breaking`,
          ].filter(Boolean);
          console.log(`  ${v.version}: ${v.commits.length} commits (${counts.join(", ") || "misc"})`);
        }
      } catch (err) {
        console.error("Error generating changelog:", err);
        process.exit(1);
      }
    }
  );

program.parse();
