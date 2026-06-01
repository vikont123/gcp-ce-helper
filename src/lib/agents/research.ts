// Company-research agent. Two-stage, server-only:
//   1. Gemini + Google Search grounding gathers current, real facts.
//   2. Claude rewrites them into the established research_text format.
// The Claude voice keeps research consistent with the (later) solution/briefing
// agents; the Gemini stage is what keeps the facts real rather than hallucinated.

import { claudeComplete, geminiGrounded } from "@/lib/llm";

export interface ResearchResult {
  researchText: string;
  deepResearchText: string;
}

function factPrompt(company: string, context?: string): string {
  return [
    `Research the company "${company}" for a Google Cloud (GCP) Customer Engineer`,
    `preparing for a technical engagement in the Israeli market.`,
    context
      ? `\nContext — the specific meeting request / focal point (the company name above was identified from this; treat "${company}" as the customer):\n${context}\n`
      : ``,
    `Use Google Search for current, verifiable facts about "${company}". Cover:`,
    `- What the company does, industry vertical, size, HQ/locations (note Israel presence).`,
    `- Their technology stack and current cloud usage (GCP / AWS / Azure / on-prem), data platforms.`,
    `- Recent news, funding, growth, or strategic moves (last ~18 months).`,
    `- Likely technical pain points or initiatives a GCP CE could help with, especially ones relevant to the request above.`,
    `\nReturn concise, factual bullet points. Prefer specifics (named products, numbers, dates) over generalities.`,
    `If search returns little about "${company}", say so explicitly rather than describing a different company.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const FORMAT_SYSTEM = `You are a senior Google Cloud Customer Engineer's research assistant for the Israeli market. You turn raw, sourced research notes into a tight company profile that a CE reads to prepare for a meeting. Be specific and factual — use only what the notes support; never invent facts. Write in clear professional English with light Markdown.`;

function formatPrompt(company: string, facts: string, context?: string): string {
  return `Using ONLY the sourced research notes below, write a company profile for the customer **${company}**.

Start with one sentence: "Here is a comprehensive profile for the **${company}** to help you prepare for your Google Cloud engagement."

Then exactly these four \`###\`-level sections, in this order:
### 1. Company Overview
### 2. Technology Stack
### 3. Potential Cloud Challenges
### 4. Engagement Context
${context ? `\nIn "Engagement Context", tie the profile to this specific request:\n${context}\n` : ``}
Use bullet points with bolded lead-ins where natural. Keep it scannable (roughly 400-600 words). If the notes lack data for a point, say so briefly rather than guessing. Do not question the company name — treat **${company}** as the confirmed customer.

Research notes:
---
${facts}`;
}

export async function generateResearch(
  company: string,
  context?: string
): Promise<ResearchResult> {
  const { text: facts, sources } = await geminiGrounded(factPrompt(company, context));
  const researchText = await claudeComplete({
    system: FORMAT_SYSTEM,
    user: formatPrompt(company, facts, context),
    maxTokens: 2500,
  });

  const sourceList = sources.length
    ? `\n\n## Sources\n${sources.map((s) => `- ${s}`).join("\n")}`
    : "";
  const deepResearchText = `${facts}${sourceList}`.trim();

  return { researchText, deepResearchText };
}
