// Athena - Doc Freshness Tracking
// Copyright 2026, Forgeborn

import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { glob } from "glob";
import type {
  AthenaConfig,
  FileHash,
  FreshnessRecord,
  FreshnessCheckResult,
} from "./types.js";

const ATHENA_VERSION = "1.0.0";

const DEFAULT_INCLUDE = [
  "src/**/*",
  "lib/**/*",
  "app/**/*",
  "pages/**/*",
  "components/**/*",
  "routes/**/*",
  "api/**/*",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.py",
  "*.cs",
  "*.go",
  "*.rs",
  "*.java",
  "*.rb",
  "*.php",
];

const DEFAULT_EXCLUDE = [
  "node_modules/**",
  "dist/**",
  "build/**",
  ".git/**",
  ".next/**",
  "__pycache__/**",
  "*.lock",
  "*.log",
  "*.map",
  "*.d.ts",
  "docs/**",
];

const DEFAULT_TRACKING_FILE = ".athena-freshness.json";

/**
 * Hash a single file's contents using SHA-256.
 */
async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Hash a string (used for config hashing).
 */
function hashString(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Discover and hash all source files in a project.
 */
export async function hashSourceFiles(
  projectDir: string,
  config?: AthenaConfig
): Promise<FileHash[]> {
  const includePatterns = config?.freshness?.include ?? DEFAULT_INCLUDE;
  const excludePatterns = config?.freshness?.exclude ?? DEFAULT_EXCLUDE;

  // Also exclude routes from config if specified
  const allExclude = [...excludePatterns];

  const files = await glob(includePatterns, {
    cwd: projectDir,
    ignore: allExclude,
    nodir: true,
    absolute: false,
  });

  // Sort for deterministic ordering
  files.sort();

  const hashes: FileHash[] = [];
  for (const file of files) {
    const fullPath = join(projectDir, file);
    try {
      const [hash, stats] = await Promise.all([
        hashFile(fullPath),
        stat(fullPath),
      ]);

      hashes.push({
        path: file,
        hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    } catch {
      // Skip files that can't be read (permissions, symlinks, etc.)
    }
  }

  return hashes;
}

/**
 * Get the tracking file path for a project.
 */
function getTrackingPath(projectDir: string, config?: AthenaConfig): string {
  const trackingFile =
    config?.freshness?.trackingFile ?? DEFAULT_TRACKING_FILE;
  return join(projectDir, trackingFile);
}

/**
 * Load the previous freshness record from disk.
 */
export async function loadFreshnessRecord(
  projectDir: string,
  config?: AthenaConfig
): Promise<FreshnessRecord | null> {
  const trackingPath = getTrackingPath(projectDir, config);

  if (!existsSync(trackingPath)) {
    return null;
  }

  try {
    const raw = await readFile(trackingPath, "utf-8");
    return JSON.parse(raw) as FreshnessRecord;
  } catch {
    return null;
  }
}

/**
 * Save a freshness record after doc generation.
 */
export async function saveFreshnessRecord(
  projectDir: string,
  sourceHashes: FileHash[],
  docsGenerated: string[],
  config?: AthenaConfig
): Promise<void> {
  const trackingPath = getTrackingPath(projectDir, config);

  // Hash the config file itself if it exists
  let configHash: string | undefined;
  const configPath = join(projectDir, "athena.config.json");
  if (existsSync(configPath)) {
    const configContent = await readFile(configPath, "utf-8");
    configHash = hashString(configContent);
  }

  const record: FreshnessRecord = {
    generatedAt: new Date().toISOString(),
    athenaVersion: ATHENA_VERSION,
    projectDir,
    sourceHashes,
    configHash,
    docsGenerated,
  };

  await writeFile(
    trackingPath,
    JSON.stringify(record, null, 2) + "\n",
    "utf-8"
  );
}

/**
 * Check if documentation is stale by comparing current source hashes
 * against the last generation record.
 */
export async function checkFreshness(
  projectDir: string,
  config?: AthenaConfig
): Promise<FreshnessCheckResult> {
  const record = await loadFreshnessRecord(projectDir, config);

  // No previous record means never generated
  if (!record) {
    return {
      isStale: true,
      changedFiles: [],
      newFiles: [],
      deletedFiles: [],
      reason: "No previous generation record found. Docs have never been generated.",
    };
  }

  // Hash current source files
  const currentHashes = await hashSourceFiles(projectDir, config);

  // Build lookup maps
  const previousMap = new Map(
    record.sourceHashes.map((h) => [h.path, h.hash])
  );
  const currentMap = new Map(
    currentHashes.map((h) => [h.path, h.hash])
  );

  // Find changes
  const changedFiles: string[] = [];
  const newFiles: string[] = [];
  const deletedFiles: string[] = [];

  // Check for new and changed files
  currentHashes.forEach((fileHash) => {
    const prevHash = previousMap.get(fileHash.path);
    if (!prevHash) {
      newFiles.push(fileHash.path);
    } else if (prevHash !== fileHash.hash) {
      changedFiles.push(fileHash.path);
    }
  });

  // Check for deleted files
  record.sourceHashes.forEach((fileHash) => {
    if (!currentMap.has(fileHash.path)) {
      deletedFiles.push(fileHash.path);
    }
  });

  // Check if config changed
  let configChanged = false;
  const configPath = join(projectDir, "athena.config.json");
  if (existsSync(configPath)) {
    const configContent = await readFile(configPath, "utf-8");
    const currentConfigHash = hashString(configContent);
    if (record.configHash && record.configHash !== currentConfigHash) {
      configChanged = true;
    }
  }

  const isStale =
    changedFiles.length > 0 ||
    newFiles.length > 0 ||
    deletedFiles.length > 0 ||
    configChanged;

  // Build reason
  let reason: string;
  if (!isStale) {
    reason = "Docs are up to date. No source changes since last generation.";
  } else {
    const parts: string[] = [];
    if (changedFiles.length > 0) {
      parts.push(`${changedFiles.length} file(s) modified`);
    }
    if (newFiles.length > 0) {
      parts.push(`${newFiles.length} file(s) added`);
    }
    if (deletedFiles.length > 0) {
      parts.push(`${deletedFiles.length} file(s) deleted`);
    }
    if (configChanged) {
      parts.push("config changed");
    }
    reason = `Docs are stale: ${parts.join(", ")}.`;
  }

  return {
    isStale,
    changedFiles,
    newFiles,
    deletedFiles,
    lastGenerated: record.generatedAt,
    reason,
  };
}

/**
 * Print a freshness check result to console.
 */
export function printFreshnessResult(result: FreshnessCheckResult): void {
  if (result.isStale) {
    console.log(`STALE: ${result.reason}`);
    if (result.lastGenerated) {
      console.log(`  Last generated: ${result.lastGenerated}`);
    }
    if (result.changedFiles.length > 0) {
      console.log(`  Modified files:`);
      for (const f of result.changedFiles.slice(0, 10)) {
        console.log(`    - ${f}`);
      }
      if (result.changedFiles.length > 10) {
        console.log(
          `    ... and ${result.changedFiles.length - 10} more`
        );
      }
    }
    if (result.newFiles.length > 0) {
      console.log(`  New files:`);
      for (const f of result.newFiles.slice(0, 10)) {
        console.log(`    + ${f}`);
      }
      if (result.newFiles.length > 10) {
        console.log(`    ... and ${result.newFiles.length - 10} more`);
      }
    }
    if (result.deletedFiles.length > 0) {
      console.log(`  Deleted files:`);
      for (const f of result.deletedFiles.slice(0, 10)) {
        console.log(`    x ${f}`);
      }
      if (result.deletedFiles.length > 10) {
        console.log(
          `    ... and ${result.deletedFiles.length - 10} more`
        );
      }
    }
  } else {
    console.log(`FRESH: ${result.reason}`);
    if (result.lastGenerated) {
      console.log(`  Last generated: ${result.lastGenerated}`);
    }
  }
}
