// Customer-email agent. Server-only. One Gemini call returns two ready-to-send
// English email templates (a post-meeting follow-up and a pre-engagement
// discovery email), each with a subject line, synthesizing the task's research,
// solution and briefing.

import { geminiComplete } from "@/lib/llm";

export interface EmailResult {
  followupSubject: string;
  followupText: string;
  discoverySubject: string;
  discoveryText: string;
}

const SYSTEM = `You are a senior Google Cloud Customer Engineer writing customer-facing emails for the Israeli market. Write in clear, professional English — warm but concise, no fluff, no over-promising. Ground everything in the provided research, solution and briefing; never invent facts or commitments.`;

function userPrompt(i: {
  company: string;
  focal: string;
  research?: string;
  problemUnderstanding?: string;
  primarySolution?: string;
  briefing?: string;
}): string {
  return `Customer: ${i.company}
Meeting request / focal comment:
${i.focal}
${i.research ? `\nCompany research:\n${i.research}\n` : ""}
${i.problemUnderstanding ? `\nProblem understanding:\n${i.problemUnderstanding}\n` : ""}
${i.primarySolution ? `\nProposed GCP solution:\n${i.primarySolution}\n` : ""}
${i.briefing ? `\nMeeting briefing:\n${i.briefing}\n` : ""}
Write TWO customer-facing emails as a JSON object with EXACTLY these keys:
{
  "followup_subject": "subject line for a post-meeting follow-up email",
  "followup_body": "the follow-up email body (Markdown): thank the customer, recap the understanding of their need, summarize the proposed GCP approach at a high level, and propose concrete next steps",
  "discovery_subject": "subject line for a pre-engagement discovery email",
  "discovery_body": "the discovery email body (Markdown): briefly restate the understanding and list the discovery questions we'd like them to consider before we dig into a solution"
}

Both bodies should be ready to send: greeting, short paragraphs, and a sign-off placeholder like "Best regards,\\n[Your name]". Return ONLY the JSON object — no markdown fences, no commentary.`;
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

export async function generateEmail(i: {
  company: string;
  focal: string;
  research?: string;
  problemUnderstanding?: string;
  primarySolution?: string;
  briefing?: string;
}): Promise<EmailResult> {
  const raw = await geminiComplete({
    system: SYSTEM,
    user: userPrompt(i),
    maxTokens: 3000,
  });
  const obj = parseJsonObject(raw);
  return {
    followupSubject: String(obj.followup_subject ?? "").trim(),
    followupText: String(obj.followup_body ?? "").trim(),
    discoverySubject: String(obj.discovery_subject ?? "").trim(),
    discoveryText: String(obj.discovery_body ?? "").trim(),
  };
}
