// Athena - Changelog Generator
// Copyright 2026, Forgeborn

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseGitLog, groupByVersion, getGitHubUrl } from "./git-parser.js";
import { renderChangelog, renderHistory } from "./renderer.js";
import type { ChangelogConfig, ChangelogResult } from "../types.js";

/**
 * Generate CHANGELOG.md (and optionally HISTORY.md) from git history.
 *
 * Pipeline:
 * 1. Detect GitHub remote URL
 * 2. Parse git log (all commits or from a specific tag)
 * 3. Group commits by version tags
 * 4. Classify commits by category (conventional commits or keyword-based)
 * 5. Render CHANGELOG.md and optionally HISTORY.md
 */
export async function generateChangelog(
  config: ChangelogConfig
): Promise<ChangelogResult> {
  const projectDir = resolve(config.projectDir);
  const outputDir = config.outputDir ? resolve(config.outputDir) : projectDir;

  // Step 1: Detect GitHub URL (use provided or auto-detect)
  const githubUrl = config.githubUrl ?? (await getGitHubUrl(projectDir));
  if (githubUrl) {
    console.log(`  GitHub: ${githubUrl}`);
  }

  // Step 2: Parse git log
  console.log("  Parsing git history...");
  const commits = await parseGitLog(projectDir, config.fromTag, config.toRef);
  console.log(`  Found ${commits.length} commits`);

  if (commits.length === 0) {
    console.log("  No commits found — nothing to generate.");
    const changelogPath = join(outputDir, "CHANGELOG.md");
    return {
      changelogPath,
      versions: [],
      totalCommits: 0,
      githubUrl,
    };
  }

  // Step 3: Group by version
  console.log("  Grouping by version tags...");
  const versions = await groupByVersion(projectDir, commits);
  console.log(`  Found ${versions.length} version section(s)`);

  // Step 4: Render CHANGELOG.md
  const changelogContent = renderChangelog(versions, githubUrl);
  await mkdir(outputDir, { recursive: true });
  const changelogPath = join(outputDir, "CHANGELOG.md");
  await writeFile(changelogPath, changelogContent, "utf-8");
  console.log(`  Written: ${changelogPath}`);

  // Step 5: Optionally render HISTORY.md
  let historyPath: string | undefined;
  if (config.includeHistory) {
    const historyContent = renderHistory(versions, githubUrl);
    historyPath = join(outputDir, "HISTORY.md");
    await writeFile(historyPath, historyContent, "utf-8");
    console.log(`  Written: ${historyPath}`);
  }

  return {
    changelogPath,
    historyPath,
    versions,
    totalCommits: commits.length,
    githubUrl,
  };
}
