// Company-insight agent. Server-only. Synthesizes ALL of a company's tasks (across
// CEs) into an account-level insight: recurring needs, which GCP products to propose
// next, and how to grow the account's revenue. Cached company-keyed in insight_cache.

import crypto from "node:crypto";
import { geminiComplete } from "@/lib/llm";

/** A single task of the company, trimmed to the fields the insight reasons over. */
export interface InsightTask {
  id?: string;
  comment?: string; // focal / FSR comment — what the customer asked for
  ceComments?: string; // work the CE actually logged
  status?: string;
  ceAssigned?: string;
  specialization?: string;
  needs?: string;
}

export interface InsightInput {
  company: string;
  tasks: InsightTask[];
  research?: string;
}

export interface InsightResult {
  insightText: string;
  tasksHash: string;
}

/**
 * Hash of the task set the insight was built from, stored in insight_cache.tasks_hash
 * so the UI can flag the insight as stale when the company's tasks change. We are the
 * sole writer, so the recipe only needs to be internally consistent.
 */
export function insightTasksHash(tasks: InsightTask[]): string {
  const material = tasks
    .map((t) => [t.id, t.status, t.comment, t.ceComments, t.needs].join("|"))
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

const SYSTEM = `You are a senior Google Cloud Customer Engineer doing account planning for an Israeli-market customer. You read the full history of engagements (tasks) with one company and produce an account-level insight that helps CEs grow the relationship. Be specific and pragmatic, naming concrete GCP services; ground every claim in the tasks provided and do not invent facts.`;

function userPrompt(i: InsightInput): string {
  const tasks = i.tasks
    .map((t, n) => {
      const lines = [
        `Task ${n + 1}${t.status ? ` [${t.status}]` : ""}${t.ceAssigned ? ` — CE: ${t.ceAssigned}` : ""}`,
        t.specialization ? `  Specialization: ${t.specialization}` : "",
        t.comment ? `  Request: ${t.comment}` : "",
        t.needs ? `  Needs: ${t.needs}` : "",
        t.ceComments ? `  Work done: ${t.ceComments}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");

  return `Customer: ${i.company}
${i.research ? `\nCompany research:\n${i.research}\n` : ""}
All engagements (tasks) with this company:
${tasks || "(no tasks)"}

Write an account insight in Markdown with EXACTLY these \`###\` sections, in order:
### Account Summary
### Recurring Needs & Patterns
### GCP Products to Propose Next
### Revenue-Growth Angles

In "GCP Products to Propose Next" use a bulleted list, each item naming a specific GCP
service and tying it to evidence from the tasks above. In "Revenue-Growth Angles" give
concrete, prioritized moves (expansion, cross-sell, consumption drivers). Keep it tight
and scannable; no fluff, no restating the task list verbatim.`;
}

/** Generate the account-level insight across all of a company's tasks. */
export async function generateCompanyInsight(i: InsightInput): Promise<InsightResult> {
  const insightText = await geminiComplete({
    system: SYSTEM,
    user: userPrompt(i),
    maxTokens: 4000,
  });
  return { insightText: insightText.trim(), tasksHash: insightTasksHash(i.tasks) };
}
