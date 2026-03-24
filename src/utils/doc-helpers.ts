// Athena - Documentation Helper Utilities
// Copyright 2026, Forgeborn

import type { DocSection, ScreenshotInfo, ProjectManifest } from "../types.js";

export function parseMarkdownSections(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent: string[] = [];
  let currentAnchor = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentContent.join("\n").trim(),
          anchor: currentAnchor,
        });
      }
      currentHeading = headingMatch[2];
      currentLevel = headingMatch[1].length;
      currentAnchor = slugify(currentHeading);
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentContent.join("\n").trim(),
      anchor: currentAnchor,
    });
  }

  return sections;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function generateTableOfContents(sections: DocSection[]): string {
  const lines: string[] = ["## Table of Contents", ""];
  for (const section of sections) {
    if (section.level <= 3) {
      const indent = "  ".repeat(section.level - 1);
      lines.push(`${indent}- [${section.heading}](#${section.anchor})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatScreenshotEmbed(screenshot: ScreenshotInfo): string {
  const alt = screenshot.description || `Screenshot of ${screenshot.route || "application"}`;
  const caption = screenshot.description || "";
  let md = `![${alt}](${screenshot.path})`;
  if (caption) {
    md += `\n*${caption}*`;
  }
  return md;
}

export function buildSourceSummary(manifest: ProjectManifest): string {
  const parts: string[] = [];

  parts.push(`Project: ${manifest.name}`);
  parts.push(`Framework: ${manifest.framework}`);
  parts.push(`Language: ${manifest.language}`);
  parts.push(`Scanned: ${manifest.scannedAt}`);
  parts.push("");

  if (manifest.routes.length > 0) {
    parts.push("## Routes");
    for (const r of manifest.routes) {
      parts.push(`- ${r.method ? r.method.toUpperCase() + " " : ""}${r.path} (${r.file})`);
    }
    parts.push("");
  }

  if (manifest.apiEndpoints.length > 0) {
    parts.push("## API Endpoints");
    for (const ep of manifest.apiEndpoints) {
      parts.push(`- ${ep.method ? ep.method.toUpperCase() + " " : ""}${ep.path} → ${ep.handler || ep.file}`);
    }
    parts.push("");
  }

  if (manifest.components.length > 0) {
    parts.push("## Components");
    for (const c of manifest.components) {
      const propsStr = c.props && c.props.length > 0 ? ` props: ${c.props.join(", ")}` : "";
      parts.push(`- ${c.name} (${c.type}, ${c.file})${propsStr}`);
    }
    parts.push("");
  }

  if (manifest.functions.length > 0) {
    parts.push("## Functions");
    for (const f of manifest.functions.filter((fn) => fn.exported)) {
      const asyncStr = f.async ? "async " : "";
      parts.push(`- ${asyncStr}${f.name}(${f.params.join(", ")}) — ${f.file}`);
    }
    parts.push("");
  }

  if (manifest.classes.length > 0) {
    parts.push("## Classes");
    for (const cls of manifest.classes.filter((c) => c.exported)) {
      parts.push(`- ${cls.name} [${cls.methods.join(", ")}] — ${cls.file}`);
    }
    parts.push("");
  }

  if (Object.keys(manifest.scripts).length > 0) {
    parts.push("## Scripts");
    for (const [name, cmd] of Object.entries(manifest.scripts)) {
      parts.push(`- \`${name}\`: \`${cmd}\``);
    }
    parts.push("");
  }

  if (Object.keys(manifest.dependencies).length > 0) {
    parts.push("## Dependencies");
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      parts.push(`- ${name}: ${version}`);
    }
    parts.push("");
  }

  if (manifest.context.claudeMdSummary) {
    parts.push("## Existing Documentation (CLAUDE.md)");
    parts.push(manifest.context.claudeMdSummary);
    parts.push("");
  }

  if (manifest.context.readmeSummary) {
    parts.push("## Existing README Summary");
    parts.push(manifest.context.readmeSummary);
    parts.push("");
  }

  return parts.join("\n");
}

export function buildCrossReferences(docs: { type: string; filename: string }[]): string {
  const lines: string[] = ["---", "", "## Related Documentation", ""];
  for (const doc of docs) {
    const title = doc.type.charAt(0).toUpperCase() + doc.type.slice(1);
    lines.push(`- [${title}](${doc.filename})`);
  }
  lines.push("");
  return lines.join("\n");
}
