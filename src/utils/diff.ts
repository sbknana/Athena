// Athena - Documentation Diffing
// Copyright 2026, Forgeborn

import { createTwoFilesPatch } from "diff";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DiffResult, DocSection } from "../types.js";
import { parseMarkdownSections } from "./doc-helpers.js";

export async function diffWithExisting(
  outputDir: string,
  filename: string,
  newContent: string
): Promise<DiffResult> {
  const filePath = join(outputDir, filename);
  let existingContent = "";

  try {
    existingContent = await readFile(filePath, "utf-8");
  } catch {
    // File doesn't exist yet — all content is new
    const newLines = newContent.split("\n").length;
    return {
      filename,
      hasChanges: true,
      addedLines: newLines,
      removedLines: 0,
      patch: createTwoFilesPatch(
        `a/${filename}`,
        `b/${filename}`,
        "",
        newContent
      ),
    };
  }

  if (existingContent === newContent) {
    return {
      filename,
      hasChanges: false,
      addedLines: 0,
      removedLines: 0,
      patch: "",
    };
  }

  const patch = createTwoFilesPatch(
    `a/${filename}`,
    `b/${filename}`,
    existingContent,
    newContent
  );

  let addedLines = 0;
  let removedLines = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) addedLines++;
    if (line.startsWith("-") && !line.startsWith("---")) removedLines++;
  }

  return {
    filename,
    hasChanges: true,
    addedLines,
    removedLines,
    patch,
  };
}

export function mergeBySection(
  existingContent: string,
  newContent: string
): string {
  const existingSections = parseMarkdownSections(existingContent);
  const newSections = parseMarkdownSections(newContent);

  if (existingSections.length === 0) return newContent;
  if (newSections.length === 0) return existingContent;

  const existingMap = new Map<string, DocSection>();
  for (const section of existingSections) {
    existingMap.set(section.anchor, section);
  }

  const mergedParts: string[] = [];

  for (const newSection of newSections) {
    const existing = existingMap.get(newSection.anchor);
    const hashes = "#".repeat(newSection.level);

    if (existing && existing.content === newSection.content) {
      // Section unchanged — keep existing
      mergedParts.push(`${hashes} ${existing.heading}\n\n${existing.content}`);
    } else {
      // Section is new or changed — use new version
      mergedParts.push(`${hashes} ${newSection.heading}\n\n${newSection.content}`);
    }
  }

  return mergedParts.join("\n\n") + "\n";
}
