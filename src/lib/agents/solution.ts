// GCP-architecture / solution agent. Server-only. One Claude call returns a
// structured solution matching solution_cache: a problem restatement, a primary
// GCP architecture narrative, and discovery questions to ask the customer.

import { claudeComplete } from "@/lib/llm";
import type { DiscoveryQuestion } from "@/lib/bigquery";

export interface SolutionResult {
  problemUnderstanding: string;
  primarySolution: string;
  discoveryQuestions: DiscoveryQuestion[];
}

const SYSTEM = `You are a senior Google Cloud Customer Engineer designing a solution for an Israeli-market customer. You propose concrete GCP architectures naming specific services (BigQuery, Dataflow, Vertex AI, Cloud Run, Pub/Sub, etc.) and tie them to the customer's actual request. Be specific and pragmatic; no fluff.`;

function userPrompt(company: string, focal: string, research?: string): string {
  return `Customer: ${company}
Meeting request / focal comment:
${focal}
${research ? `\nWhat we know about the customer (research):\n${research}\n` : ""}
Produce a solution as a JSON object with EXACTLY these keys:
{
  "problem_understanding": "1 short paragraph restating the customer's problem and goal in technical terms",
  "primary_solution": "2-4 paragraphs proposing a concrete GCP architecture for THIS request, naming specific services and how they fit together",
  "discovery_questions": [ { "question": "...", "example_answer": "..." }, ... ]  // 5-7 sharp questions to ask the customer, each with a realistic example answer
}

Return ONLY the JSON object — no markdown fences, no commentary.`;
}

/** Extract a JSON object from a model reply that may include stray text/fences. */
function parseJsonObject(text: string): Record<string, unknown> {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!t.startsWith("{")) {
    const i = t.indexOf("{");
    const j = t.lastIndexOf("}");
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
  }
  return JSON.parse(t) as Record<string, unknown>;
}

export async function generateSolution(args: {
  company: string;
  focal: string;
  research?: string;
}): Promise<SolutionResult> {
  const raw = await claudeComplete({
    system: SYSTEM,
    user: userPrompt(args.company, args.focal, args.research),
    maxTokens: 3000,
  });
  const obj = parseJsonObject(raw);

  const dqRaw = Array.isArray(obj.discovery_questions) ? obj.discovery_questions : [];
  const discoveryQuestions: DiscoveryQuestion[] = dqRaw
    .map((q) => {
      const o = (q ?? {}) as Record<string, unknown>;
      return {
        question: String(o.question ?? "").trim(),
        example_answer: o.example_answer ? String(o.example_answer).trim() : undefined,
      };
    })
    .filter((q) => q.question);

  return {
    problemUnderstanding: String(obj.problem_understanding ?? "").trim(),
    primarySolution: String(obj.primary_solution ?? "").trim(),
    discoveryQuestions,
  };
}
