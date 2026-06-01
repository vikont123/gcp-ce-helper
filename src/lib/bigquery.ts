// Server-only BigQuery access for the AI-artifact caches in dataset
// `gcp_crm_data`. Never import this from a client component — it uses the
// service-account key file, same as src/lib/sheets.ts.

import crypto from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";

const PROJECT = process.env.BIGQUERY_PROJECT_ID || "mytestingenv-355509";
const DATASET = process.env.BIGQUERY_DATASET || "gcp_crm_data";
const ds = (table: string) => `\`${PROJECT}.${DATASET}.${table}\``;

let _client: BigQuery | null = null;
function client(): BigQuery {
  if (!_client) {
    _client = new BigQuery({
      projectId: PROJECT,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  return _client;
}

/**
 * Cache key for per-task artifacts. MUST match the pipeline that populated the
 * tables (verified empirically): sha256 of the trimmed focal comment, first 16
 * hex chars. Keeping this exact lets us reuse the ~200 existing artifacts.
 */
export function focalHash(focalComment: string): string {
  return crypto
    .createHash("sha256")
    .update((focalComment ?? "").trim(), "utf8")
    .digest("hex")
    .slice(0, 16);
}

// ---- Artifact shapes (mirror the table schemas) --------------------------

export interface DiscoveryQuestion {
  question: string;
  example_answer?: string;
}

export interface ResearchArtifact {
  company_name: string;
  research_text: string | null;
  deep_research_text: string | null;
  edited_by_user: boolean | null;
  updated_at: string | null;
}

export interface SolutionArtifact {
  task_id: string;
  focal_hash: string;
  company_name: string | null;
  problem_understanding: string | null;
  primary_solution: string | null;
  discovery_questions: DiscoveryQuestion[];
  answers: unknown;
  additional_context: string | null;
  refined_solution: string | null;
  refined_count: number | null;
  edited_by_user: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BriefingArtifact {
  task_id: string;
  focal_hash: string;
  company_name: string | null;
  briefing_text: string | null;
  is_refined: boolean | null;
  refined_count: number | null;
  edited_by_user: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BillingArtifact {
  company_name: string;
  report_text: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Everything we show for one task, plus staleness info for the UI banner. */
export interface TaskArtifacts {
  focalHash: string;
  research: ResearchArtifact | null;
  solution: SolutionArtifact | null;
  briefing: BriefingArtifact | null;
  billing: BillingArtifact | null;
  /** A solution exists for this task but under a different (older) focal_hash. */
  solutionStale: boolean;
  briefingStale: boolean;
}

// ---- Helpers -------------------------------------------------------------

async function queryRows<T>(
  query: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const [rows] = await client().query({ query, params });
  return rows as T[];
}

/** BigQuery JSON columns may come back as a string or an object; normalize. */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** BigQuery TIMESTAMP comes back as { value: "..." } — flatten to a string. */
function tsString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "value" in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value);
}

// ---- Reads ---------------------------------------------------------------

export async function getResearch(
  company: string
): Promise<ResearchArtifact | null> {
  if (!company?.trim()) return null;
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT company_name, research_text, deep_research_text, edited_by_user, updated_at
     FROM ${ds("research_cache")}
     WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(@company))
     ORDER BY updated_at DESC LIMIT 1`,
    { company }
  );
  const r = rows[0];
  if (!r) return null;
  return {
    company_name: String(r.company_name ?? company),
    research_text: (r.research_text as string) ?? null,
    deep_research_text: (r.deep_research_text as string) ?? null,
    edited_by_user: (r.edited_by_user as boolean) ?? null,
    updated_at: tsString(r.updated_at),
  };
}

export async function getBilling(
  company: string
): Promise<BillingArtifact | null> {
  if (!company?.trim()) return null;
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT company_name, report_text, created_at, updated_at
     FROM ${ds("billing_cache")}
     WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(@company))
     ORDER BY updated_at DESC LIMIT 1`,
    { company }
  );
  const r = rows[0];
  if (!r) return null;
  return {
    company_name: String(r.company_name ?? company),
    report_text: (r.report_text as string) ?? null,
    created_at: tsString(r.created_at),
    updated_at: tsString(r.updated_at),
  };
}

function mapSolution(r: Record<string, unknown>): SolutionArtifact {
  return {
    task_id: String(r.task_id),
    focal_hash: String(r.focal_hash),
    company_name: (r.company_name as string) ?? null,
    problem_understanding: (r.problem_understanding as string) ?? null,
    primary_solution: (r.primary_solution as string) ?? null,
    discovery_questions: parseJson<DiscoveryQuestion[]>(r.discovery_questions, []),
    answers: parseJson<unknown>(r.answers, null),
    additional_context: (r.additional_context as string) ?? null,
    refined_solution: (r.refined_solution as string) ?? null,
    refined_count: (r.refined_count as number) ?? null,
    edited_by_user: (r.edited_by_user as boolean) ?? null,
    created_at: tsString(r.created_at),
    updated_at: tsString(r.updated_at),
  };
}

export async function getSolution(
  taskId: string,
  fHash: string
): Promise<{ artifact: SolutionArtifact | null; stale: boolean }> {
  if (!taskId) return { artifact: null, stale: false };
  // Latest row for this task, regardless of focal_hash.
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT * FROM ${ds("solution_cache")}
     WHERE task_id = @taskId
     ORDER BY updated_at DESC LIMIT 1`,
    { taskId }
  );
  const r = rows[0];
  if (!r) return { artifact: null, stale: false };
  const artifact = mapSolution(r);
  return { artifact, stale: artifact.focal_hash !== fHash };
}

function mapBriefing(r: Record<string, unknown>): BriefingArtifact {
  return {
    task_id: String(r.task_id),
    focal_hash: String(r.focal_hash),
    company_name: (r.company_name as string) ?? null,
    briefing_text: (r.briefing_text as string) ?? null,
    is_refined: (r.is_refined as boolean) ?? null,
    refined_count: (r.refined_count as number) ?? null,
    edited_by_user: (r.edited_by_user as boolean) ?? null,
    created_at: tsString(r.created_at),
    updated_at: tsString(r.updated_at),
  };
}

export async function getBriefing(
  taskId: string,
  fHash: string
): Promise<{ artifact: BriefingArtifact | null; stale: boolean }> {
  if (!taskId) return { artifact: null, stale: false };
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT * FROM ${ds("briefing_cache")}
     WHERE task_id = @taskId
     ORDER BY updated_at DESC LIMIT 1`,
    { taskId }
  );
  const r = rows[0];
  if (!r) return { artifact: null, stale: false };
  const artifact = mapBriefing(r);
  return { artifact, stale: artifact.focal_hash !== fHash };
}

/** Fetch all artifacts for a task in parallel. */
export async function getTaskArtifacts(args: {
  taskId: string;
  company: string;
  focalComment: string;
}): Promise<TaskArtifacts> {
  const fHash = focalHash(args.focalComment);
  const [research, billing, sol, brief] = await Promise.all([
    getResearch(args.company),
    getBilling(args.company),
    getSolution(args.taskId, fHash),
    getBriefing(args.taskId, fHash),
  ]);
  return {
    focalHash: fHash,
    research,
    billing,
    solution: sol.artifact,
    briefing: brief.artifact,
    solutionStale: sol.stale,
    briefingStale: brief.stale,
  };
}
