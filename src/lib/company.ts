// Resolve the real customer company for a task. The Sheet `account_name` column
// is sometimes a placeholder (e.g. "NotinList") or a market-stage label (e.g.
// "EarlyStage") rather than the actual company — the real name is reliably in the
// focal comment. Server-only (uses the LLM helpers).

import { claudeComplete } from "@/lib/llm";

// Lowercased account_name values that are NOT real companies. Extend as needed.
const PLACEHOLDER_ACCOUNTS = new Set([
  "",
  "notinlist",
  "not in list",
  "notlisted",
  "earlystage",
  "early stage",
  "n/a",
  "na",
  "tbd",
  "unknown",
  "-",
]);

export function isPlaceholderAccount(name: string | null | undefined): boolean {
  return PLACEHOLDER_ACCOUNTS.has((name ?? "").trim().toLowerCase());
}

export interface ResolvedCompany {
  company: string;
  /** true when account_name was a placeholder and we extracted from the comment. */
  usedFallback: boolean;
}

const RESOLVE_SYSTEM = `You identify the real customer company in a Google Cloud Customer Engineer's task. You are given a focal comment that describes the customer request. Return ONLY the customer company's name — no quotes, no explanation, no trailing punctuation. If several organizations are mentioned, pick the customer (the company the CE is helping), not vendors/tools (e.g. not "Snowflake", "Rivery", "BigQuery"). If no company is identifiable, return exactly: UNKNOWN.`;

/**
 * Resolve the real company for a task. Non-placeholder account names are trusted
 * verbatim (no LLM call). Placeholder names are resolved from the focal comment.
 */
export async function resolveCompanyName(
  accountName: string,
  focalComment: string
): Promise<ResolvedCompany> {
  const account = (accountName ?? "").trim();
  if (!isPlaceholderAccount(account)) {
    return { company: account, usedFallback: false };
  }

  const comment = (focalComment ?? "").trim();
  if (!comment) {
    return { company: account || "Unknown", usedFallback: false };
  }

  const answer = (
    await claudeComplete({
      system: RESOLVE_SYSTEM,
      user: `account_name: ${JSON.stringify(account)}\nfocal comment:\n${comment}`,
      maxTokens: 40,
    })
  )
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();

  if (!answer || answer.toUpperCase() === "UNKNOWN") {
    return { company: account || "Unknown", usedFallback: false };
  }
  return { company: answer, usedFallback: true };
}
