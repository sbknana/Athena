// Athena - Doc Quality Loop
// Copyright 2026, Forgeborn
//
// Generates docs, scores them against the quality_rubric from docs-config.json,
// and regenerates with targeted feedback until the target score is met or
// max iterations are exhausted.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ClaudeClient } from "./claude-client.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import {
  buildSourceSummary,
  generateTableOfContents,
  parseMarkdownSections,
  buildCrossReferences,
} from "../utils/doc-helpers.js";
import { diffWithExisting, mergeBySection } from "../utils/diff.js";
import { loadDocsConfig } from "./doc-generator.js";
import type {
  DocGeneratorConfig,
  DocsConfig,
  DocType,
  GeneratedDoc,
  DiffResult,
  ProjectManifest,
  QualityScore,
  QualityCriterionFeedback,
  QualityEvaluation,
  QualityLoopConfig,
  QualityLoopIterationResult,
  QualityLoopResult,
} from "../types.js";

const DOC_FILENAMES: Record<DocType, string> = {
  readme: "README.md",
  architecture: "ARCHITECTURE.md",
  api: "API.md",
  deployment: "DEPLOYMENT.md",
  contributing: "CONTRIBUTING.md",
};

const QUALITY_CRITERIA: Array<keyof QualityScore> = [
  "conversational_flow",
  "feature_completeness",
  "honesty",
  "runnable_examples",
  "new_user_clarity",
  "tone",
];

/**
 * Build the scoring prompt that asks Claude to evaluate a generated doc
 * against the quality rubric from docs-config.json.
 */
function buildScoringSystemPrompt(docsConfig: DocsConfig): string {
  const rubric = docsConfig.quality_rubric;
  if (!rubric) {
    throw new Error("docs-config.json must include a quality_rubric section for the quality loop");
  }

  return `You are a documentation quality evaluator. Score the provided documentation against this rubric.

For each criterion, assign a score from 1 to 5 and provide specific, actionable feedback.

CRITERIA:
${Object.entries(rubric.criteria)
  .map(([key, description]) => `- ${key}: ${description}`)
  .join("\n")}

STYLE RULES TO CHECK:
${docsConfig.style_guide.rules.map((rule) => `- ${rule}`).join("\n")}

BANNED WORDS (automatic 1 for tone if any are used):
revolutionary, cutting-edge, game-changing, seamless, robust, next-generation,
leverage, utilize, facilitate, streamline, synergy, scalable (unless literally about scaling),
enterprise-grade, mission-critical, best-in-class, world-class, state-of-the-art, comprehensive, solution

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no explanation — raw JSON only):
{
  "scores": {
    "conversational_flow": <1-5>,
    "feature_completeness": <1-5>,
    "honesty": <1-5>,
    "runnable_examples": <1-5>,
    "new_user_clarity": <1-5>,
    "tone": <1-5>
  },
  "feedback": [
    {
      "criterion": "<criterion_name>",
      "score": <1-5>,
      "feedback": "<specific actionable feedback — what to fix and how>"
    }
  ]
}

Be strict. A score of 5 means genuinely excellent. Most decent docs score 3-4.
Only give 5 if the criterion is handled exceptionally well.
A score of 1-2 means the criterion is poorly handled and needs significant rework.`;
}

/**
 * Build the regeneration prompt that includes specific feedback from the scorer.
 */
function buildRegenerationPrompt(
  originalUserPrompt: string,
  evaluation: QualityEvaluation,
  docType: DocType,
  iteration: number
): string {
  const failingCriteria = evaluation.feedback.filter((f) => f.score < 4);

  let prompt = originalUserPrompt;
  prompt += `\n\n--- QUALITY IMPROVEMENT (iteration ${iteration + 1}) ---`;
  prompt += `\nPrevious score: ${evaluation.total}/${evaluation.maxScore} (target: 24)`;
  prompt += `\n\nThe following criteria need improvement:\n`;

  for (const criterion of failingCriteria) {
    prompt += `\n## ${criterion.criterion} (score: ${criterion.score}/5)`;
    prompt += `\n${criterion.feedback}\n`;
  }

  prompt += `\nFix ALL the issues above. The doc must score at least 4 on each criterion.`;
  prompt += `\nGenerate the ${docType} documentation now. Output ONLY the markdown content, no surrounding explanation.`;

  return prompt;
}

/**
 * Parse the scorer's JSON response into a QualityEvaluation.
 * Handles Claude sometimes wrapping JSON in markdown code blocks.
 */
function parseScoringResponse(response: string): QualityEvaluation {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: { scores: QualityScore; feedback: QualityCriterionFeedback[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse scoring response as JSON: ${cleaned.slice(0, 200)}...`);
  }

  // Validate and clamp scores to 1-5 range
  const scores: QualityScore = { ...parsed.scores };
  for (const key of QUALITY_CRITERIA) {
    const val = scores[key];
    if (typeof val !== "number" || val < 1 || val > 5) {
      scores[key] = Math.max(1, Math.min(5, Math.round(Number(val) || 1)));
    }
  }

  const total = QUALITY_CRITERIA.reduce((sum, key) => sum + scores[key], 0);
  const maxScore = QUALITY_CRITERIA.length * 5;

  return {
    scores,
    total,
    maxScore,
    passed: total >= 24,
    feedback: parsed.feedback ?? [],
  };
}

/**
 * Run the quality improvement loop for documentation generation.
 *
 * For each doc type:
 * 1. Generate the doc using Claude (quality model)
 * 2. Score it against the quality rubric
 * 3. If score < target, regenerate with targeted feedback
 * 4. Repeat up to maxIterations times
 */
export class QualityLoop {
  private client: ClaudeClient;
  private config: QualityLoopConfig;

  constructor(config: QualityLoopConfig) {
    this.config = config;
    this.client = new ClaudeClient(config.model, config.apiKey);
  }

  async run(manifest: ProjectManifest): Promise<QualityLoopResult> {
    const sourceSummary = buildSourceSummary(manifest);

    const docsConfig = this.config.docsConfig ?? await loadDocsConfig(this.config.projectDir);
    if (!docsConfig) {
      throw new Error("docs-config.json is required for the quality loop. Create one in the project root.");
    }

    if (!docsConfig.quality_rubric) {
      throw new Error("docs-config.json must include a quality_rubric section.");
    }

    console.log(`  Quality loop: target ${this.config.targetScore}/${QUALITY_CRITERIA.length * 5}, max ${this.config.maxIterations} iterations`);
    console.log(`  Using docs-config.json (project: ${docsConfig.project_name})`);

    await mkdir(this.config.outputDir, { recursive: true });

    const docs: GeneratedDoc[] = [];
    const diffs: DiffResult[] = [];
    const iterations: QualityLoopIterationResult[] = [];
    const finalScores: Record<string, QualityEvaluation> = {};

    for (const docType of this.config.docs) {
      console.log(`\n  --- ${DOC_FILENAMES[docType]} ---`);

      const result = await this.generateWithQualityLoop(
        docType,
        sourceSummary,
        docsConfig,
        iterations
      );

      docs.push(result.doc);
      finalScores[docType] = result.finalEval;
    }

    // Add cross-references
    const crossRefDocs = docs.map((d) => ({ type: d.type, filename: d.filename }));
    for (const doc of docs) {
      const otherDocs = crossRefDocs.filter((d) => d.type !== doc.type);
      if (otherDocs.length > 0) {
        doc.content += "\n" + buildCrossReferences(otherDocs);
        doc.sections = parseMarkdownSections(doc.content);
      }
    }

    // Add TOC for docs with 4+ sections
    for (const doc of docs) {
      if (doc.sections.length > 4) {
        const toc = generateTableOfContents(doc.sections);
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

    // Diff and write files
    for (const doc of docs) {
      const diff = await diffWithExisting(this.config.outputDir, doc.filename, doc.content);
      diffs.push(diff);

      if (this.config.diffMode && !diff.hasChanges) {
        console.log(`  ${doc.filename}: no changes, skipping write`);
        continue;
      }

      if (this.config.diffMode && diff.hasChanges) {
        try {
          const existing = await readFile(
            join(this.config.outputDir, doc.filename),
            "utf-8"
          );
          doc.content = mergeBySection(existing, doc.content);
        } catch {
          // File doesn't exist, use generated content
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
      iterations,
      finalScores: finalScores as Record<DocType, QualityEvaluation>,
    };
  }

  private async generateWithQualityLoop(
    docType: DocType,
    sourceSummary: string,
    docsConfig: DocsConfig,
    iterations: QualityLoopIterationResult[]
  ): Promise<{ doc: GeneratedDoc; finalEval: QualityEvaluation }> {
    const systemPrompt = buildSystemPrompt(docType, docsConfig);
    const baseUserPrompt = buildUserPrompt(sourceSummary, "", docType, docsConfig);

    // Iteration 0: initial generation
    console.log(`  [iter 0] Generating...`);
    let content = await this.client.generate(systemPrompt, baseUserPrompt);

    let lastEval: QualityEvaluation | undefined;

    for (let i = 0; i < this.config.maxIterations; i++) {
      // Score the current doc
      console.log(`  [iter ${i}] Scoring...`);
      const evaluation = await this.scoreDoc(content, docType, docsConfig);
      lastEval = evaluation;

      const iterResult: QualityLoopIterationResult = {
        iteration: i,
        docType,
        evaluation,
        regenerated: false,
      };

      console.log(`  [iter ${i}] Score: ${evaluation.total}/${evaluation.maxScore} (${evaluation.passed ? "PASS" : "FAIL"})`);

      // Log individual scores
      for (const key of QUALITY_CRITERIA) {
        const score = evaluation.scores[key];
        const icon = score >= 4 ? "+" : score >= 3 ? "~" : "-";
        console.log(`    ${icon} ${key}: ${score}/5`);
      }

      if (evaluation.passed) {
        iterations.push(iterResult);
        console.log(`  [iter ${i}] Passed! No regeneration needed.`);
        break;
      }

      if (i < this.config.maxIterations - 1) {
        // Regenerate with feedback
        console.log(`  [iter ${i}] Below target. Regenerating with feedback...`);
        const regenPrompt = buildRegenerationPrompt(baseUserPrompt, evaluation, docType, i);
        content = await this.client.generate(systemPrompt, regenPrompt);
        iterResult.regenerated = true;
      } else {
        console.log(`  [iter ${i}] Max iterations reached. Using best result.`);
      }

      iterations.push(iterResult);
    }

    if (!lastEval) {
      throw new Error("Quality loop completed with no evaluation — this should not happen");
    }

    const sections = parseMarkdownSections(content);
    return {
      doc: {
        type: docType,
        filename: DOC_FILENAMES[docType],
        content,
        sections,
      },
      finalEval: lastEval,
    };
  }

  private async scoreDoc(
    docContent: string,
    docType: DocType,
    docsConfig: DocsConfig
  ): Promise<QualityEvaluation> {
    const scoringSystem = buildScoringSystemPrompt(docsConfig);
    const scoringUser = `Score this ${docType} documentation:\n\n---\n${docContent}\n---`;

    const response = await this.client.generate(scoringSystem, scoringUser);
    return parseScoringResponse(response);
  }
}

/**
 * Print a summary of the quality loop results.
 */
export function printQualityLoopSummary(result: QualityLoopResult): void {
  console.log("\n--- Quality Loop Summary ---");
  console.log(`  Model: ${result.model}`);
  console.log(`  Total iterations: ${result.iterations.length}`);

  for (const [docType, evaluation] of Object.entries(result.finalScores)) {
    const status = evaluation.passed ? "PASS" : "FAIL";
    console.log(`  ${DOC_FILENAMES[docType as DocType]}: ${evaluation.total}/${evaluation.maxScore} [${status}]`);

    for (const key of QUALITY_CRITERIA) {
      const score = evaluation.scores[key];
      console.log(`    ${key}: ${score}/5`);
    }
  }
}
