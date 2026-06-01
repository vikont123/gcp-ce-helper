// Server-only LLM access via Vertex AI. Never import from a client component —
// it authenticates with the same ADC service account as src/lib/sheets.ts and
// src/lib/bigquery.ts (GOOGLE_APPLICATION_CREDENTIALS).
//
// Two backends, one Vertex project:
//   - Claude (Anthropic on Vertex) — writing/formatting, our house voice.
//   - Gemini (Google on Vertex) — fact-gathering with Google Search grounding,
//     which Claude on Vertex cannot do natively.

import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GoogleGenAI } from "@google/genai";

const PROJECT = process.env.ANTHROPIC_VERTEX_PROJECT_ID || "mytestingenv-355509";
const CLAUDE_REGION = process.env.CLOUD_ML_REGION || "global";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
// Gemini grounding is verified working on the `global` endpoint; allow an
// override in case a future model needs a regional one. gemini-2.0-flash is not
// enabled in this project — 2.5-flash is.
const GEMINI_LOCATION = process.env.GEMINI_LOCATION || CLAUDE_REGION;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let _claude: AnthropicVertex | null = null;
function claude(): AnthropicVertex {
  if (!_claude) _claude = new AnthropicVertex({ region: CLAUDE_REGION, projectId: PROJECT });
  return _claude;
}

let _gemini: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!_gemini) {
    _gemini = new GoogleGenAI({ vertexai: true, project: PROJECT, location: GEMINI_LOCATION });
  }
  return _gemini;
}

/** A single Claude completion. Returns the concatenated text blocks. */
export async function claudeComplete(args: {
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const msg = await claude().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: args.maxTokens ?? 4096,
    ...(args.system ? { system: args.system } : {}),
    messages: [{ role: "user", content: args.user }],
  });
  return msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

export interface GroundedResult {
  /** The model's grounded answer text. */
  text: string;
  /** Source URLs surfaced by Google Search grounding (deduped). */
  sources: string[];
}

/** Gemini call with Google Search grounding. Used for live company facts. */
export async function geminiGrounded(prompt: string): Promise<GroundedResult> {
  const r = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });
  const meta = r.candidates?.[0]?.groundingMetadata;
  const sources = Array.from(
    new Set(
      (meta?.groundingChunks ?? [])
        .map((c) => c.web?.uri)
        .filter((u): u is string => Boolean(u))
    )
  );
  return { text: (r.text ?? "").trim(), sources };
}
