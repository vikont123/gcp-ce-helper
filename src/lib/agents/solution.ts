// GCP-architecture / solution agent. Server-only. One Gemini call returns a
// structured solution matching solution_cache: a problem restatement, a primary
// GCP architecture narrative, and discovery questions to ask the customer.

import { geminiComplete } from "@/lib/llm";
import type { DiscoveryQuestion, DiscoveryAnswer } from "@/lib/bigquery";

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
  const raw = await geminiComplete({
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

const REFINE_SYSTEM = `${SYSTEM} You are now refining an earlier proposal using the customer's answers to your discovery questions plus extra context the CE added. Sharpen and tailor the architecture to what you now know; resolve assumptions the answers settle, drop options the answers rule out, and add specifics the answers enable.`;

function refinePrompt(args: {
  company: string;
  focal: string;
  research?: string;
  problemUnderstanding: string;
  primarySolution: string;
  discoveryQuestions: DiscoveryQuestion[];
  answers: DiscoveryAnswer[];
  comment: string;
}): string {
  const answerByQuestion = new Map(
    args.answers.map((a) => [a.question.trim(), a.answer.trim()])
  );
  const qa = args.discoveryQuestions
    .map((q) => {
      const a = answerByQuestion.get(q.question.trim());
      return `- Q: ${q.question}\n  A: ${a && a.length ? a : "(no answer given)"}`;
    })
    .join("\n");

  return `Customer: ${args.company}
Meeting request / focal comment:
${args.focal}
${args.research ? `\nCompany research:\n${args.research}\n` : ""}
Original problem understanding:
${args.problemUnderstanding}

Original proposed solution:
${args.primarySolution}

Customer answers to the discovery questions:
${qa || "(none)"}
${args.comment.trim() ? `\nAdditional context from the CE:\n${args.comment.trim()}\n` : ""}
Write a REFINED GCP solution in Markdown (2-5 paragraphs, with bolded lead-ins or a short
bullet list where it helps). Name specific GCP services and tie every recommendation to what
the answers and context above revealed. Do not restate the questions; output only the refined
solution prose.`;
}

/** Refine an existing solution using the customer's answers + extra CE context. */
export async function generateRefinedSolution(args: {
  company: string;
  focal: string;
  research?: string;
  problemUnderstanding: string;
  primarySolution: string;
  discoveryQuestions: DiscoveryQuestion[];
  answers: DiscoveryAnswer[];
  comment: string;
}): Promise<{ refinedSolution: string }> {
  const refinedSolution = await geminiComplete({
    system: REFINE_SYSTEM,
    user: refinePrompt(args),
    maxTokens: 3000,
  });
  return { refinedSolution: refinedSolution.trim() };
}
