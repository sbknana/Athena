// Athena - Context File Reader
// Copyright 2026, TheForge, LLC

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ContextFiles } from "../types.js";

export async function readContextFiles(
  projectDir: string
): Promise<ContextFiles> {
  const result: ContextFiles = {};

  // CLAUDE.md
  const claudeMdPath = join(projectDir, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    result.claudeMd = await readFile(claudeMdPath, "utf-8");
  }

  // README.md (case-insensitive check)
  const readmeVariants = ["README.md", "readme.md", "Readme.md", "README.MD"];
  for (const variant of readmeVariants) {
    const readmePath = join(projectDir, variant);
    if (existsSync(readmePath)) {
      result.readmeMd = await readFile(readmePath, "utf-8");
      break;
    }
  }

  // package.json
  const packageJsonPath = join(projectDir, "package.json");
  if (existsSync(packageJsonPath)) {
    const raw = await readFile(packageJsonPath, "utf-8");
    result.packageJson = JSON.parse(raw) as Record<string, unknown>;
  }

  // pyproject.toml
  const pyprojectPath = join(projectDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    result.pyprojectToml = await readFile(pyprojectPath, "utf-8");
  }

  return result;
}

export function summarizeText(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;

  // Take the first section/paragraph up to maxLength
  const truncated = text.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > maxLength / 2) {
    return truncated.slice(0, lastNewline) + "\n...";
  }
  return truncated + "...";
}
