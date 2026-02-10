// Athena - Claude API Client
// Copyright 2026, TheForge, LLC

import Anthropic from "@anthropic-ai/sdk";
import type { ModelTier } from "../types.js";

const MODEL_MAP: Record<ModelTier, string> = {
  speed: "claude-sonnet-4-5-20250929",
  quality: "claude-opus-4-6",
};

const MAX_TOKENS = 8192;

export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor(tier: ModelTier, apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = MODEL_MAP[tier];
  }

  getModelName(): string {
    return this.model;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude API");
    }
    return textBlock.text;
  }
}
