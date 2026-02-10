#!/usr/bin/env node
// Athena CLI - Project Scanner and Manifest Generator
// Copyright 2026, TheForge, LLC

import { Command } from "commander";
import { resolve, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
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
import type { DocType, ModelTier, CLIScreenshotConfig, DiagramType } from "./types.js";
import {
  runCLIScreenshotEngine,
  loadCLIScreenshotConfig,
} from "./screenshots/cli-screenshot-engine.js";
import { DiagramGenerator } from "./diagrams/index.js";

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

// --- Config Init Command ---

program
  .command("init")
  .description("Initialize athena.config.json in a project directory")
  .requiredOption("--project <path>", "Path to the project directory")
  .option("--name <name>", "Project name")
  .option("--description <desc>", "Project description")
  .action(
    async (options: {
      project: string;
      name?: string;
      description?: string;
    }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      if (hasConfig(projectDir)) {
        console.error(
          "Error: athena.config.json already exists in this project."
        );
        process.exit(1);
      }

      try {
        const configPath = await initConfig(projectDir, {
          projectName: options.name,
          description: options.description,
        });
        console.log(`Config created: ${configPath}`);
        console.log(
          "  Edit this file to customize Athena's behavior for your project."
        );
      } catch (err) {
        console.error("Error creating config:", err);
        process.exit(1);
      }
    }
  );

// --- Freshness Check Command ---

program
  .command("check")
  .description(
    "Check if docs are stale (exit 1 if stale, for CI integration)"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option("--json", "Output result as JSON", false)
  .action(
    async (options: { project: string; json: boolean }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      try {
        const config = await loadConfig(projectDir);
        const result = await checkFreshness(projectDir, config);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printFreshnessResult(result);
        }

        // Exit 1 if stale (for CI pipelines)
        if (result.isStale) {
          process.exit(1);
        }
      } catch (err) {
        console.error("Error checking freshness:", err);
        process.exit(1);
      }
    }
  );

// --- Freshness Stamp Command ---

program
  .command("stamp")
  .description(
    "Record current source file hashes (run after doc generation to mark docs as fresh)"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--docs <files>",
    "Comma-separated list of doc filenames that were generated",
    "README.md,ARCHITECTURE.md,API.md,DEPLOYMENT.md,CONTRIBUTING.md"
  )
  .action(
    async (options: { project: string; docs: string }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      try {
        const config = await loadConfig(projectDir);
        console.log("Hashing source files...");
        const hashes = await hashSourceFiles(projectDir, config);
        console.log(`  Hashed ${hashes.length} files`);

        const docsGenerated = options.docs
          .split(",")
          .map((d) => d.trim());
        await saveFreshnessRecord(
          projectDir,
          hashes,
          docsGenerated,
          config
        );
        console.log("Freshness record saved.");
      } catch (err) {
        console.error("Error stamping freshness:", err);
        process.exit(1);
      }
    }
  );

// --- Watch Mode Command ---

program
  .command("watch")
  .description(
    "Watch project source files and flag when docs become stale"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--interval <ms>",
    "Polling interval in milliseconds",
    "5000"
  )
  .option("--regenerate", "Auto-regenerate docs when stale (requires API key)", false)
  .action(
    async (options: {
      project: string;
      interval: string;
      regenerate: boolean;
    }) => {
      const projectDir = resolve(options.project);
      const intervalMs = parseInt(options.interval, 10);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      if (isNaN(intervalMs) || intervalMs < 1000) {
        console.error("Error: --interval must be at least 1000ms");
        process.exit(1);
      }

      const config = await loadConfig(projectDir);

      console.log(`Watching project: ${projectDir}`);
      console.log(`  Poll interval: ${intervalMs}ms`);
      console.log(`  Auto-regenerate: ${options.regenerate}`);
      console.log("  Press Ctrl+C to stop.\n");

      let lastStaleState = false;

      const check = async () => {
        try {
          const result = await checkFreshness(projectDir, config);

          if (result.isStale && !lastStaleState) {
            // Transition from fresh to stale
            console.log(
              `[${new Date().toISOString()}] STALE: ${result.reason}`
            );
            if (result.changedFiles.length > 0) {
              console.log(
                `  Changed: ${result.changedFiles.slice(0, 5).join(", ")}${result.changedFiles.length > 5 ? ` (+${result.changedFiles.length - 5} more)` : ""}`
              );
            }

            if (options.regenerate) {
              console.log("  Auto-regeneration triggered...");
              try {
                // Re-scan and regenerate
                const manifest = await scanProject(projectDir);
                const manifestPath = join(
                  projectDir,
                  "project-manifest.json"
                );
                await writeFile(
                  manifestPath,
                  JSON.stringify(manifest, null, 2) + "\n",
                  "utf-8"
                );

                // Stamp freshness after regeneration
                const hashes = await hashSourceFiles(
                  projectDir,
                  config
                );
                await saveFreshnessRecord(
                  projectDir,
                  hashes,
                  ["project-manifest.json"],
                  config
                );
                console.log(
                  `  [${new Date().toISOString()}] Regenerated and stamped.`
                );
              } catch (regenErr) {
                console.error("  Regeneration failed:", regenErr);
              }
            }
          } else if (!result.isStale && lastStaleState) {
            // Transition from stale to fresh
            console.log(
              `[${new Date().toISOString()}] FRESH: Docs are up to date.`
            );
          }

          lastStaleState = result.isStale;
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error:`, err);
        }
      };

      // Initial check
      await check();

      // Poll loop
      const timer = setInterval(check, intervalMs);

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        clearInterval(timer);
        console.log("\nWatch stopped.");
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        clearInterval(timer);
        process.exit(0);
      });
    }
  );

// --- Schedule Command ---

program
  .command("schedule")
  .description(
    "Show cron expression for scheduling periodic doc regeneration"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--cron <expression>",
    "Cron expression to save to config (e.g., '0 2 * * *' for daily at 2am)"
  )
  .option("--show-ci", "Show example GitHub Actions workflow", false)
  .action(
    async (options: {
      project: string;
      cron?: string;
      showCi: boolean;
    }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      const config = await loadConfig(projectDir);

      if (options.cron) {
        // Validate cron expression (basic: 5 fields)
        const parts = options.cron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          console.error(
            "Error: Invalid cron expression. Expected 5-6 space-separated fields."
          );
          console.error(
            "  Format: minute hour day-of-month month day-of-week"
          );
          console.error('  Example: "0 2 * * *" (daily at 2:00 AM)');
          process.exit(1);
        }

        // Save to config
        config.schedule = config.schedule ?? {};
        config.schedule.cron = options.cron.trim();

        const configPath = join(projectDir, "athena.config.json");
        const existingConfig = existsSync(configPath)
          ? JSON.parse(await readFile(configPath, "utf-8"))
          : {};
        existingConfig.schedule = config.schedule;

        await writeFile(
          configPath,
          JSON.stringify(existingConfig, null, 2) + "\n",
          "utf-8"
        );
        console.log(`Cron schedule saved to athena.config.json: ${options.cron}`);
      }

      // Show current schedule
      const cron = config.schedule?.cron;
      if (cron) {
        console.log(`\nSchedule: ${cron}`);
        console.log(describeCron(cron));
      } else if (!options.cron) {
        console.log(
          "No schedule configured. Use --cron to set one."
        );
        console.log(
          '  Example: athena schedule --project . --cron "0 2 * * *"'
        );
      }

      if (options.showCi) {
        const cronExpr = cron ?? "0 2 * * *";
        console.log("\n--- GitHub Actions Workflow ---");
        console.log(`
name: Athena Doc Freshness Check

on:
  push:
    branches: [main, master]
  schedule:
    - cron: '${cronExpr}'

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Athena
        run: npm install -g athena

      - name: Check doc freshness
        run: athena check --project .

      - name: Regenerate docs (if stale)
        if: failure()
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          athena generate --project .
          athena generate-docs --project . --scan --diff
          athena stamp --project .

      - name: Commit updated docs
        if: failure()
        run: |
          git config user.name "Athena Bot"
          git config user.email "athena@theforge.llc"
          git add docs/ project-manifest.json .athena-freshness.json
          git diff --staged --quiet || git commit -m "docs: auto-regenerate stale documentation"
          git push
`);
      }
    }
  );

// --- CLI Screenshot Command ---

program
  .command("capture-cli")
  .description(
    "Auto-capture CLI tool output as SVG screenshots (detects commands from package.json, bin, athena.config.json)"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--output <path>",
    "Output directory for screenshots (default: <project>/docs/screenshots)"
  )
  .option("--theme <theme>", "Color theme: 'dark' or 'light'", "dark")
  .option("--timeout <ms>", "Command timeout in milliseconds", "10000")
  .option("--width <px>", "SVG width in pixels", "820")
  .option("--font-size <px>", "Font size in pixels", "14")
  .action(
    async (options: {
      project: string;
      output?: string;
      theme: string;
      timeout: string;
      width: string;
      fontSize: string;
    }) => {
      const projectDir = resolve(options.project);

      if (!existsSync(projectDir)) {
        console.error(
          `Error: Project directory does not exist: ${projectDir}`
        );
        process.exit(1);
      }

      if (options.theme !== "dark" && options.theme !== "light") {
        console.error("Error: --theme must be 'dark' or 'light'");
        process.exit(1);
      }

      try {
        // Load config from athena.config.json (if present)
        const fileConfig = await loadCLIScreenshotConfig(projectDir);

        // Build final config: file config as base, CLI flags override
        const config: CLIScreenshotConfig = {
          ...fileConfig,
          projectDir,
          theme: options.theme as "dark" | "light",
          timeout: parseInt(options.timeout, 10),
          width: parseInt(options.width, 10),
          fontSize: parseInt(options.fontSize, 10),
        };

        if (options.output) {
          config.outputDir = resolve(options.output);
        }

        const result = await runCLIScreenshotEngine(config);

        if (result.failures > 0) {
          process.exit(1);
        }
      } catch (err) {
        console.error("Error capturing CLI screenshots:", err);
        process.exit(1);
      }
    }
  );

/**
 * Produce a human-readable description of a cron expression.
 */
function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return "  (invalid cron expression)";

  const [minute, hour, dom, month, dow] = parts;

  const descriptions: string[] = [];

  // Time
  if (minute === "0" && hour !== "*") {
    descriptions.push(`at ${hour}:00`);
  } else if (minute !== "*" && hour !== "*") {
    descriptions.push(`at ${hour}:${minute.padStart(2, "0")}`);
  } else if (minute === "*" && hour === "*") {
    descriptions.push("every minute");
  } else if (minute.startsWith("*/")) {
    descriptions.push(`every ${minute.slice(2)} minutes`);
  }

  // Day of week
  const dowNames: Record<string, string> = {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday",
  };

  if (dow === "*" && dom === "*" && month === "*") {
    descriptions.push("every day");
  } else if (dow === "1-5") {
    descriptions.push("weekdays only");
  } else if (dow !== "*") {
    const dayName = dowNames[dow] ?? dow;
    descriptions.push(`on ${dayName}`);
  }

  if (dom !== "*") {
    descriptions.push(`on day ${dom} of the month`);
  }

  return descriptions.length > 0
    ? `  Runs ${descriptions.join(", ")}`
    : `  Custom schedule: ${cron}`;
}

// --- Diagram Generation Command ---

const ALL_DIAGRAM_TYPES: DiagramType[] = [
  "dependency",
  "imports",
  "db-schema",
  "api-flow",
  "component-tree",
  "file-structure",
  "data-flow",
];

program
  .command("diagrams")
  .description(
    "Generate Mermaid architecture diagrams from code analysis (dependency graph, ER diagram, API flow, component tree, file structure, data flow)"
  )
  .requiredOption("--project <path>", "Path to the project directory")
  .option(
    "--output <path>",
    "Output directory for diagrams (default: <project>/docs/diagrams)"
  )
  .option(
    "--types <types>",
    `Comma-separated diagram types: ${ALL_DIAGRAM_TYPES.join(",")}`,
    ALL_DIAGRAM_TYPES.join(",")
  )
  .option(
    "--render",
    "Render Mermaid to PNG/SVG using @mermaid-js/mermaid-cli",
    false
  )
  .option(
    "--format <format>",
    "Render format: 'png', 'svg', or 'both'",
    "both"
  )
  .option("--no-markdown", "Skip generating DIAGRAMS.md")
  .option("--scan", "Run project scan before generating diagrams", false)
  .action(
    async (options: {
      project: string;
      output?: string;
      types: string;
      render: boolean;
      format: string;
      markdown: boolean;
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
        : join(projectDir, "docs", "diagrams");

      // Validate diagram types
      const requestedTypes = options.types.split(",").map((t) => t.trim());
      for (const t of requestedTypes) {
        if (!ALL_DIAGRAM_TYPES.includes(t as DiagramType)) {
          console.error(
            `Error: Unknown diagram type '${t}'. Valid types: ${ALL_DIAGRAM_TYPES.join(", ")}`
          );
          process.exit(1);
        }
      }

      // Validate format
      if (!["png", "svg", "both"].includes(options.format)) {
        console.error(
          "Error: --format must be 'png', 'svg', or 'both'"
        );
        process.exit(1);
      }

      try {
        // Optionally scan first
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

        // Generate diagrams
        console.log(`\nGenerating diagrams...`);
        const generator = new DiagramGenerator({
          projectDir,
          outputDir,
          types: requestedTypes as DiagramType[],
          render: options.render,
          format: options.format as "png" | "svg" | "both",
          markdown: options.markdown,
        });

        const result = await generator.generate(manifest);

        // Print summary
        console.log(`\nDiagram generation complete!`);
        console.log(`  Diagrams: ${result.diagrams.length}`);
        console.log(`  Output: ${outputDir}`);

        for (const d of result.diagrams) {
          const rendered = d.renderResults.filter((r) => r.success);
          const suffix = rendered.length > 0
            ? ` (rendered: ${rendered.map((r) => r.format).join(", ")})`
            : "";
          console.log(`  - ${d.type}: ${d.mmdPath}${suffix}`);
        }

        if (result.errors.length > 0) {
          console.log(`\n  Errors:`);
          for (const e of result.errors) {
            console.log(`  - ${e.type}: ${e.error}`);
          }
        }

        if (result.markdownPath) {
          console.log(`\n  Markdown: ${result.markdownPath}`);
        }

        if (result.diagrams.length === 0) {
          console.log(
            "\n  No diagrams were generated. The project may not have enough data for analysis."
          );
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
          console.error("Error generating diagrams:", err);
        }
        process.exit(1);
      }
    }
  );

program.parse();
