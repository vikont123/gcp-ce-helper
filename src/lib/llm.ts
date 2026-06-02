// Server-only LLM access. Never import from a client component. Uses the Gemini
// Developer API (generativelanguage.googleapis.com) authenticated with
// GOOGLE_API_KEY — the `-latest` model aliases below are Developer-API names and
// do not exist on Vertex AI.
//
// One backend, driven by the two models configured in .env.local:
//   - MODEL_PRO   — writing/formatting, our house voice.
//   - MODEL_FLASH — fact-gathering with Google Search grounding.

import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_PRO = process.env.MODEL_PRO || "gemini-pro-latest";
const MODEL_FLASH = process.env.MODEL_FLASH || "gemini-flash-latest";

let _gemini: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!_gemini) {
    if (!API_KEY) throw new Error("GOOGLE_API_KEY is not set");
    _gemini = new GoogleGenAI({ apiKey: API_KEY });
  }
  return _gemini;
}

/** A single Gemini (MODEL_PRO) completion. Returns the response text. */
export async function geminiComplete(args: {
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const r = await gemini().models.generateContent({
    model: MODEL_PRO,
    contents: args.user,
    config: {
      ...(args.system ? { systemInstruction: args.system } : {}),
      maxOutputTokens: args.maxTokens ?? 4096,
    },
  });
  return (r.text ?? "").trim();
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
    model: MODEL_FLASH,
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
