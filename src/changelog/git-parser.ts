// Athena - Git Log Parser
// Copyright 2026, Forgeborn

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ParsedCommit, CommitCategory, VersionSection } from "../types.js";

const execFileAsync = promisify(execFile);

// Conventional commit pattern: type(scope)!: subject
const CONVENTIONAL_RE =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/i;

// Category mappings from conventional commit types
const TYPE_TO_CATEGORY: Record<string, CommitCategory> = {
  feat: "feature",
  feature: "feature",
  fix: "fix",
  bugfix: "fix",
  refactor: "refactor",
  docs: "docs",
  doc: "docs",
  chore: "chore",
  build: "chore",
  test: "test",
  tests: "test",
  style: "style",
  perf: "perf",
  performance: "perf",
  ci: "ci",
};

// Keyword-based classification fallback when no conventional commit prefix is found
const KEYWORD_PATTERNS: Array<{ pattern: RegExp; category: CommitCategory }> = [
  { pattern: /\b(?:add|implement|new|feature|introduce)\b/i, category: "feature" },
  { pattern: /\b(?:fix|bug|patch|resolve|correct|repair)\b/i, category: "fix" },
  { pattern: /\b(?:refactor|restructure|reorganize|simplify|clean\s*up)\b/i, category: "refactor" },
  { pattern: /\b(?:doc|readme|comment|changelog|jsdoc|typedoc)\b/i, category: "docs" },
  { pattern: /\b(?:test|spec|jest|mocha|vitest|coverage)\b/i, category: "test" },
  { pattern: /\b(?:style|format|lint|prettier|eslint)\b/i, category: "style" },
  { pattern: /\b(?:perf|optimize|speed|fast|cache|lazy)\b/i, category: "perf" },
  { pattern: /\b(?:ci|pipeline|workflow|deploy|docker|github.actions)\b/i, category: "ci" },
];

/**
 * Classify a commit message that doesn't follow conventional commit format.
 */
function classifyByKeyword(subject: string): CommitCategory {
  for (const { pattern, category } of KEYWORD_PATTERNS) {
    if (pattern.test(subject)) {
      return category;
    }
  }
  return "chore";
}

/**
 * Extract PR number from subject line (e.g., "Fix bug (#42)" or "Merge pull request #42")
 */
function extractPRNumber(subject: string): number | undefined {
  const prMatch = subject.match(/\(#(\d+)\)/);
  if (prMatch) return parseInt(prMatch[1], 10);

  const mergeMatch = subject.match(/Merge pull request #(\d+)/);
  if (mergeMatch) return parseInt(mergeMatch[1], 10);

  return undefined;
}

/**
 * Extract issue numbers from commit body (e.g., "Fixes #123", "Closes #456")
 */
function extractIssueNumbers(body: string): number[] {
  const issues: number[] = [];
  const re = /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
  let match;
  while ((match = re.exec(body)) !== null) {
    issues.push(parseInt(match[1], 10));
  }
  return issues;
}

/**
 * Detect if a commit contains breaking changes.
 */
function isBreaking(subject: string, body: string, conventionalBreaking: boolean): boolean {
  if (conventionalBreaking) return true;
  if (/BREAKING[\s-]CHANGE/i.test(body)) return true;
  if (/BREAKING[\s-]CHANGE/i.test(subject)) return true;
  return false;
}

/**
 * Parse a single git log entry into a ParsedCommit.
 */
function parseCommitEntry(raw: string): ParsedCommit | null {
  // Format: hash|shortHash|author|date|subject|body
  // We use \x1f (unit separator) as delimiter
  const parts = raw.split("\x1f");
  if (parts.length < 5) return null;

  const [hash, shortHash, author, date, subject, ...bodyParts] = parts;
  const body = bodyParts.join("\x1f").trim();

  // Try conventional commit parsing
  const conventional = CONVENTIONAL_RE.exec(subject);
  let category: CommitCategory;
  let scope: string | undefined;
  let conventionalBreaking = false;

  if (conventional?.groups) {
    const type = conventional.groups.type.toLowerCase();
    category = TYPE_TO_CATEGORY[type] ?? "chore";
    scope = conventional.groups.scope || undefined;
    conventionalBreaking = conventional.groups.breaking === "!";
  } else {
    category = classifyByKeyword(subject);
  }

  const breaking = isBreaking(subject, body, conventionalBreaking);
  if (breaking) category = "breaking";

  const prNumber = extractPRNumber(subject);
  const issueNumbers = extractIssueNumbers(body);

  return {
    hash,
    shortHash,
    subject,
    body,
    author,
    date,
    category,
    scope,
    breaking,
    prNumber,
    issueNumbers,
  };
}

/**
 * Run a git command in the given project directory.
 */
async function git(projectDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectDir,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Get all tags sorted by creation date (newest first).
 */
export async function getTags(projectDir: string): Promise<Array<{ name: string; date: string }>> {
  try {
    const output = await git(projectDir, [
      "tag",
      "--sort=-creatordate",
      "--format=%(refname:short)\x1f%(creatordate:iso-strict)",
    ]);

    if (!output.trim()) return [];

    return output
      .trim()
      .split("\n")
      .map((line) => {
        const [name, date] = line.split("\x1f");
        return { name, date };
      });
  } catch {
    return [];
  }
}

/**
 * Detect the GitHub remote URL if one exists. Returns the HTTPS URL.
 */
export async function getGitHubUrl(projectDir: string): Promise<string | undefined> {
  try {
    const output = await git(projectDir, ["remote", "get-url", "origin"]);
    const url = output.trim();

    // SSH format: git@github.com:user/repo.git
    const sshMatch = url.match(/git@github\.com:(.+?)(?:\.git)?$/);
    if (sshMatch) return `https://github.com/${sshMatch[1]}`;

    // HTTPS format: https://github.com/user/repo.git
    const httpsMatch = url.match(/https:\/\/github\.com\/(.+?)(?:\.git)?$/);
    if (httpsMatch) return `https://github.com/${httpsMatch[1]}`;

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse all commits from git log, optionally between two refs.
 */
export async function parseGitLog(
  projectDir: string,
  fromRef?: string,
  toRef?: string
): Promise<ParsedCommit[]> {
  const format = "%H\x1f%h\x1f%an\x1f%ai\x1f%s\x1f%b";
  const separator = "\x1e"; // record separator

  const args = ["log", `--format=${separator}${format}`];

  if (fromRef && toRef) {
    args.push(`${fromRef}..${toRef}`);
  } else if (fromRef) {
    args.push(`${fromRef}..HEAD`);
  } else if (toRef) {
    args.push(toRef);
  }

  const output = await git(projectDir, args);
  if (!output.trim()) return [];

  const entries = output.split(separator).filter((e) => e.trim());
  const commits: ParsedCommit[] = [];

  for (const entry of entries) {
    const parsed = parseCommitEntry(entry.trim());
    if (parsed) commits.push(parsed);
  }

  return commits;
}

/**
 * Group commits into version sections based on tags.
 * Commits between tags form a version. Commits after the latest tag are "Unreleased".
 */
export async function groupByVersion(
  projectDir: string,
  allCommits?: ParsedCommit[]
): Promise<VersionSection[]> {
  const tags = await getTags(projectDir);
  const commits = allCommits ?? (await parseGitLog(projectDir));
  const sections: VersionSection[] = [];

  if (tags.length === 0) {
    // No tags — everything goes into a single "Unreleased" section
    sections.push(buildVersionSection("Unreleased", new Date().toISOString().split("T")[0], undefined, commits));
    return sections;
  }

  // Build tag commit hashes for boundary detection
  const tagHashes: Array<{ name: string; date: string; hash: string }> = [];
  for (const tag of tags) {
    try {
      const hash = (await git(projectDir, ["rev-list", "-1", tag.name])).trim();
      tagHashes.push({ ...tag, hash });
    } catch {
      // Skip tags that can't be resolved
    }
  }

  // Create commit index for fast lookup
  const commitIndex = new Map<string, number>();
  commits.forEach((c, i) => commitIndex.set(c.hash, i));

  // Find tag positions in commit list
  const boundaries: Array<{ name: string; date: string; index: number }> = [];
  for (const tag of tagHashes) {
    const idx = commitIndex.get(tag.hash);
    if (idx !== undefined) {
      boundaries.push({ name: tag.name, date: tag.date, index: idx });
    }
  }

  // Sort boundaries by index (earliest in log = most recent)
  boundaries.sort((a, b) => a.index - b.index);

  // Commits before the first tag boundary are "Unreleased"
  if (boundaries.length > 0 && boundaries[0].index > 0) {
    const unreleased = commits.slice(0, boundaries[0].index);
    if (unreleased.length > 0) {
      sections.push(
        buildVersionSection("Unreleased", new Date().toISOString().split("T")[0], undefined, unreleased)
      );
    }
  }

  // Each tag boundary to the next
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].index;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].index : commits.length;
    const versionCommits = commits.slice(start, end);
    const dateStr = boundaries[i].date.split("T")[0];

    sections.push(
      buildVersionSection(boundaries[i].name, dateStr, boundaries[i].name, versionCommits)
    );
  }

  return sections;
}

/**
 * Build a VersionSection from a list of commits.
 */
function buildVersionSection(
  version: string,
  date: string,
  tag: string | undefined,
  commits: ParsedCommit[]
): VersionSection {
  return {
    version,
    date,
    tag,
    commits,
    features: commits.filter((c) => c.category === "feature"),
    fixes: commits.filter((c) => c.category === "fix"),
    refactors: commits.filter((c) => c.category === "refactor"),
    docs: commits.filter((c) => c.category === "docs"),
    chores: commits.filter((c) => c.category === "chore"),
    tests: commits.filter((c) => c.category === "test"),
    styles: commits.filter((c) => c.category === "style"),
    perfs: commits.filter((c) => c.category === "perf"),
    ci: commits.filter((c) => c.category === "ci"),
    breaking: commits.filter((c) => c.breaking),
  };
}
