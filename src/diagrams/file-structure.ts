// Athena - File Structure Diagram Generator
// Copyright 2026, Forgeborn

import { readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { existsSync } from "node:fs";

interface DirNode {
  name: string;
  path: string;
  children: DirNode[];
  isDir: boolean;
  fileCount?: number;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  "bin",
  "obj",
  "coverage",
  ".turbo",
  ".cache",
  ".nuxt",
  ".output",
  ".svelte-kit",
  "target",
]);

const IGNORE_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitkeep",
]);

/**
 * Generate a Mermaid graph showing directory structure of important dirs.
 */
export async function generateFileStructureDiagram(
  projectDir: string
): Promise<string> {
  const tree = await buildDirTree(projectDir, 0, 3);
  if (!tree || tree.children.length === 0) return "";

  const lines: string[] = ["graph TD"];
  const added = new Set<string>();
  let nodeCount = 0;

  function addNode(node: DirNode, parentId?: string): void {
    if (nodeCount > 40) return;

    const id = sanitizeId(node.path || node.name);
    if (added.has(id)) return;
    added.add(id);
    nodeCount++;

    if (node.isDir) {
      const countSuffix = node.fileCount ? ` (${node.fileCount})` : "";
      lines.push(`  ${id}["${escapeLabel(node.name + countSuffix)}"]:::dir`);
    } else {
      lines.push(`  ${id}["${escapeLabel(node.name)}"]:::file`);
    }

    if (parentId) {
      lines.push(`  ${parentId} --> ${id}`);
    }

    if (node.isDir) {
      // Show directories first, then important files
      const dirs = node.children.filter((c) => c.isDir);
      const files = node.children.filter((c) => !c.isDir);

      for (const child of dirs) {
        addNode(child, id);
      }

      // Only show important files (config, entry points)
      const importantFiles = files.filter((f) => isImportantFile(f.name));
      for (const child of importantFiles.slice(0, 5)) {
        addNode(child, id);
      }

      // Show remaining file count
      const remainingFiles = files.length - importantFiles.slice(0, 5).length;
      if (remainingFiles > 0 && nodeCount < 40) {
        const moreId = sanitizeId(node.path + "_more");
        lines.push(`  ${moreId}["${remainingFiles} more files"]:::meta`);
        lines.push(`  ${id} --> ${moreId}`);
        nodeCount++;
      }
    }
  }

  addNode(tree);

  lines.push(`  classDef dir fill:#e8f4f8,stroke:#2196F3,stroke-width:2px`);
  lines.push(`  classDef file fill:#fff,stroke:#666`);
  lines.push(`  classDef meta fill:#f5f5f5,stroke:#999,stroke-dasharray: 5 5`);

  return lines.join("\n");
}

async function buildDirTree(
  dirPath: string,
  depth: number,
  maxDepth: number
): Promise<DirNode> {
  const name = basename(dirPath) || dirPath;
  const node: DirNode = {
    name,
    path: dirPath,
    children: [],
    isDir: true,
    fileCount: 0,
  };

  if (depth >= maxDepth) return node;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => {
      // Dirs first, then files, alphabetically within each group
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (IGNORE_FILES.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !isImportantDotFile(entry.name)) continue;

      const entryPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const childNode = await buildDirTree(entryPath, depth + 1, maxDepth);
        node.children.push(childNode);
      } else {
        node.fileCount = (node.fileCount || 0) + 1;
        node.children.push({
          name: entry.name,
          path: entryPath,
          children: [],
          isDir: false,
        });
      }
    }
  } catch {
    // Permission errors or unreadable dirs
  }

  return node;
}

function isImportantFile(name: string): boolean {
  const importantPatterns = [
    /^package\.json$/,
    /^tsconfig\.json$/,
    /^\.env$/,
    /^\.env\.example$/,
    /^docker-compose\.ya?ml$/,
    /^Dockerfile$/,
    /^README\.md$/i,
    /^CLAUDE\.md$/i,
    /^index\.(ts|tsx|js|jsx|py)$/,
    /^main\.(ts|tsx|js|jsx|py)$/,
    /^app\.(ts|tsx|js|jsx|py)$/,
    /^server\.(ts|tsx|js|jsx|py)$/,
    /^schema\.prisma$/,
    /^manage\.py$/,
    /^requirements\.txt$/,
    /^pyproject\.toml$/,
    /^go\.mod$/,
    /^Cargo\.toml$/,
    /^\.csproj$/,
    /^Makefile$/,
    /^setup\.py$/,
    /^vite\.config\./,
    /^next\.config\./,
    /^webpack\.config\./,
  ];

  return importantPatterns.some((p) => p.test(name));
}

function isImportantDotFile(name: string): boolean {
  const important = [
    ".env",
    ".env.example",
    ".gitignore",
    ".dockerignore",
    ".eslintrc",
    ".prettierrc",
  ];
  return important.some((f) => name.startsWith(f));
}

function sanitizeId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    || "node";
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/[<>]/g, "");
}
