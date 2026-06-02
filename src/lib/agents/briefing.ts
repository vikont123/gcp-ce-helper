// Meeting-briefing agent. Server-only. Synthesizes research + solution + the focal
// request into the 7-section briefing the CE reads before the meeting (matches the
// established briefing_cache format).

import crypto from "node:crypto";
import { geminiComplete } from "@/lib/llm";

export interface BriefingInput {
  company: string;
  focal: string;
  research?: string;
  problemUnderstanding?: string;
  primarySolution?: string;
}

export interface BriefingResult {
  briefingText: string;
  inputsHash: string;
}

/**
 * Hash of the generation inputs, stored in briefing_cache.inputs_hash so the
 * briefing can be detected as stale when research/solution change. We are the sole
 * writer, so the exact recipe only needs to be internally consistent.
 */
export function briefingInputsHash(i: BriefingInput): string {
  const material = [i.research ?? "", i.problemUnderstanding ?? "", i.primarySolution ?? ""].join("\n---\n");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

const SYSTEM = `You are a senior Google Cloud Customer Engineer preparing a colleague for a customer meeting in the Israeli market. You write a tight, actionable meeting briefing in Markdown. Ground everything in the provided research and proposed solution; do not invent facts.`;

function userPrompt(i: BriefingInput): string {
  return `Customer: ${i.company}
Meeting request / focal comment:
${i.focal}
${i.research ? `\nCompany research:\n${i.research}\n` : ""}
${i.problemUnderstanding ? `\nProblem understanding:\n${i.problemUnderstanding}\n` : ""}
${i.primarySolution ? `\nProposed GCP solution:\n${i.primarySolution}\n` : ""}
Write a meeting briefing in Markdown with EXACTLY these \`###\` sections, in order:
### 1. Meeting Objective
### 2. Icebreaker & Rapport
### 3. Key Talking Points
### 4. Strategic Discovery Questions
### 5. Objection Handling
### 6. Competitive Analysis (GCP vs Competitors)
### 7. Preparation Resources

In Key Talking Points use bolded lead-ins (e.g. **The Hook:**, **The Value:**). In
Objection Handling use **Objection:** / **Counter:** pairs. In Competitive Analysis
include **GCP Strengths:** and **GCP Weaknesses & Mitigation:**. Keep it scannable.`;
}

export async function generateBriefing(i: BriefingInput): Promise<BriefingResult> {
  const briefingText = await geminiComplete({
    system: SYSTEM,
    user: userPrompt(i),
    maxTokens: 4000,
  });
  return { briefingText, inputsHash: briefingInputsHash(i) };
}
