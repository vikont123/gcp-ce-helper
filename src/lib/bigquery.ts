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

/** A customer's answer to a discovery question, captured for the refine flow. */
export interface DiscoveryAnswer {
  question: string;
  answer: string;
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
  answers: DiscoveryAnswer[];
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

/** Two customer-facing email templates (follow-up + discovery), keyed per task. */
export interface EmailArtifact {
  task_id: string;
  focal_hash: string;
  company_name: string | null;
  followup_subject: string | null;
  followup_text: string | null;
  discovery_subject: string | null;
  discovery_text: string | null;
  edited_by_user: boolean | null;
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
  email: EmailArtifact | null;
  /** A solution exists for this task but under a different (older) focal_hash. */
  solutionStale: boolean;
  briefingStale: boolean;
  emailStale: boolean;
}

// ---- Helpers -------------------------------------------------------------

async function queryRows<T>(
  query: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const [rows] = await client().query({ query, params });
  return rows as T[];
}

/**
 * True if an error is BigQuery's "table doesn't exist yet". Read helpers no longer
 * run CREATE TABLE on the hot path (that DDL is a separate job that serialized in
 * front of every read); instead they treat a missing table as "no data". The
 * table is created lazily by the first write (the upsert/update helpers).
 */
function isMissingTable(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /Not found: Table|Table .* (?:was )?not found|does not exist/i.test(m);
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

/**
 * Upsert a generated research artifact by company name. Never overwrites a row a
 * user has edited (`edited_by_user = TRUE`). Parameterized DML (not a streaming
 * insert) so the row stays immediately re-updatable.
 */
export async function upsertResearch(args: {
  company: string;
  researchText: string;
  deepResearchText?: string | null;
}): Promise<void> {
  const company = args.company?.trim();
  if (!company) throw new Error("upsertResearch: empty company");
  await client().query({
    query: `
      MERGE ${ds("research_cache")} T
      USING (SELECT @company AS company_name) S
      ON LOWER(TRIM(T.company_name)) = LOWER(TRIM(S.company_name))
      WHEN MATCHED AND T.edited_by_user IS NOT TRUE THEN UPDATE SET
        research_text = @researchText,
        deep_research_text = @deepResearchText,
        edited_by_user = FALSE,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (company_name, research_text, deep_research_text, edited_by_user, updated_at)
        VALUES (@company, @researchText, @deepResearchText, FALSE, CURRENT_TIMESTAMP())`,
    params: {
      company,
      researchText: args.researchText,
      deepResearchText: args.deepResearchText ?? null,
    },
    types: { company: "STRING", researchText: "STRING", deepResearchText: "STRING" },
  });
}

/** Save a user's research edit — sets edited_by_user TRUE (blocks future regen). */
export async function updateResearchText(
  company: string,
  researchText: string
): Promise<void> {
  if (!company?.trim()) throw new Error("updateResearchText: empty company");
  await client().query({
    query: `UPDATE ${ds("research_cache")}
      SET research_text = @researchText, edited_by_user = TRUE, updated_at = CURRENT_TIMESTAMP()
      WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(@company))`,
    params: { company, researchText },
    types: { company: "STRING", researchText: "STRING" },
  });
}

// ---- Solution writes -----------------------------------------------------

export async function upsertSolution(args: {
  taskId: string;
  focalHash: string;
  company: string;
  problemUnderstanding: string;
  primarySolution: string;
  discoveryQuestions: DiscoveryQuestion[];
}): Promise<void> {
  if (!args.taskId || !args.focalHash) throw new Error("upsertSolution: missing key");
  await client().query({
    query: `
      MERGE ${ds("solution_cache")} T
      USING (SELECT @taskId AS task_id, @focalHash AS focal_hash) S
      ON T.task_id = S.task_id AND T.focal_hash = S.focal_hash
      WHEN MATCHED AND T.edited_by_user IS NOT TRUE THEN UPDATE SET
        company_name = @company,
        problem_understanding = @problem,
        primary_solution = @primary,
        discovery_questions = PARSE_JSON(@dq),
        edited_by_user = FALSE,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (task_id, focal_hash, company_name, problem_understanding, primary_solution,
         discovery_questions, refined_count, edited_by_user, created_at, updated_at)
        VALUES (@taskId, @focalHash, @company, @problem, @primary,
         PARSE_JSON(@dq), 0, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: {
      taskId: args.taskId,
      focalHash: args.focalHash,
      company: args.company,
      problem: args.problemUnderstanding,
      primary: args.primarySolution,
      dq: JSON.stringify(args.discoveryQuestions ?? []),
    },
    types: {
      taskId: "STRING", focalHash: "STRING", company: "STRING",
      problem: "STRING", primary: "STRING", dq: "STRING",
    },
  });
}

/** Save a user's solution edit — sets edited_by_user TRUE. */
export async function updateSolutionFields(args: {
  taskId: string;
  focalHash: string;
  problemUnderstanding: string;
  primarySolution: string;
  discoveryQuestions: DiscoveryQuestion[];
}): Promise<void> {
  await client().query({
    query: `UPDATE ${ds("solution_cache")} SET
        problem_understanding = @problem,
        primary_solution = @primary,
        discovery_questions = PARSE_JSON(@dq),
        edited_by_user = TRUE,
        updated_at = CURRENT_TIMESTAMP()
      WHERE task_id = @taskId AND focal_hash = @focalHash`,
    params: {
      taskId: args.taskId, focalHash: args.focalHash,
      problem: args.problemUnderstanding, primary: args.primarySolution,
      dq: JSON.stringify(args.discoveryQuestions ?? []),
    },
    types: {
      taskId: "STRING", focalHash: "STRING",
      problem: "STRING", primary: "STRING", dq: "STRING",
    },
  });
}

/**
 * Save a refinement pass: the customer's answers + extra context and the newly
 * refined solution. Bumps refined_count. A direct UPDATE (unlike upsertSolution's
 * MERGE) so it applies even to rows a user has edited — refine is user-initiated.
 */
export async function upsertSolutionRefinement(args: {
  taskId: string;
  focalHash: string;
  answers: DiscoveryAnswer[];
  additionalContext: string;
  refinedSolution: string;
}): Promise<void> {
  if (!args.taskId || !args.focalHash) throw new Error("upsertSolutionRefinement: missing key");
  await client().query({
    query: `UPDATE ${ds("solution_cache")} SET
        answers = PARSE_JSON(@answers),
        additional_context = @ctx,
        refined_solution = @refined,
        refined_count = IFNULL(refined_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP()
      WHERE task_id = @taskId AND focal_hash = @focalHash`,
    params: {
      taskId: args.taskId,
      focalHash: args.focalHash,
      answers: JSON.stringify(args.answers ?? []),
      ctx: args.additionalContext,
      refined: args.refinedSolution,
    },
    types: {
      taskId: "STRING", focalHash: "STRING",
      answers: "STRING", ctx: "STRING", refined: "STRING",
    },
  });
}

// ---- Briefing writes -----------------------------------------------------

export async function upsertBriefing(args: {
  taskId: string;
  focalHash: string;
  company: string;
  briefingText: string;
  inputsHash: string;
}): Promise<void> {
  if (!args.taskId || !args.focalHash) throw new Error("upsertBriefing: missing key");
  await client().query({
    query: `
      MERGE ${ds("briefing_cache")} T
      USING (SELECT @taskId AS task_id, @focalHash AS focal_hash) S
      ON T.task_id = S.task_id AND T.focal_hash = S.focal_hash
      WHEN MATCHED AND T.edited_by_user IS NOT TRUE THEN UPDATE SET
        company_name = @company,
        briefing_text = @text,
        inputs_hash = @inputsHash,
        edited_by_user = FALSE,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (task_id, focal_hash, company_name, briefing_text, inputs_hash,
         is_refined, refined_count, edited_by_user, created_at, updated_at)
        VALUES (@taskId, @focalHash, @company, @text, @inputsHash,
         FALSE, 0, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: {
      taskId: args.taskId, focalHash: args.focalHash, company: args.company,
      text: args.briefingText, inputsHash: args.inputsHash,
    },
    types: {
      taskId: "STRING", focalHash: "STRING", company: "STRING",
      text: "STRING", inputsHash: "STRING",
    },
  });
}

/** Save a user's briefing edit — sets edited_by_user TRUE. */
export async function updateBriefingText(args: {
  taskId: string;
  focalHash: string;
  briefingText: string;
}): Promise<void> {
  await client().query({
    query: `UPDATE ${ds("briefing_cache")}
      SET briefing_text = @text, edited_by_user = TRUE, updated_at = CURRENT_TIMESTAMP()
      WHERE task_id = @taskId AND focal_hash = @focalHash`,
    params: { taskId: args.taskId, focalHash: args.focalHash, text: args.briefingText },
    types: { taskId: "STRING", focalHash: "STRING", text: "STRING" },
  });
}

// ---- Email writes/reads --------------------------------------------------
// email_cache may pre-exist from the original pipeline with a legacy single-email
// schema (email_text / uploaded_notes / links). We create it if missing, then add
// the two-template columns if absent — both idempotent, neither destructive.

let _emailTableReady = false;
async function ensureEmailTable(): Promise<void> {
  if (_emailTableReady) return;
  await client().query({
    query: `CREATE TABLE IF NOT EXISTS ${ds("email_cache")} (
      task_id STRING NOT NULL,
      focal_hash STRING NOT NULL,
      company_name STRING,
      followup_subject STRING,
      followup_text STRING,
      discovery_subject STRING,
      discovery_text STRING,
      edited_by_user BOOL,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    )`,
  });
  await client().query({
    query: `ALTER TABLE ${ds("email_cache")}
      ADD COLUMN IF NOT EXISTS followup_subject STRING,
      ADD COLUMN IF NOT EXISTS followup_text STRING,
      ADD COLUMN IF NOT EXISTS discovery_subject STRING,
      ADD COLUMN IF NOT EXISTS discovery_text STRING`,
  });
  _emailTableReady = true;
}

export async function upsertEmail(args: {
  taskId: string;
  focalHash: string;
  company: string;
  followupSubject: string;
  followupText: string;
  discoverySubject: string;
  discoveryText: string;
}): Promise<void> {
  if (!args.taskId || !args.focalHash) throw new Error("upsertEmail: missing key");
  await ensureEmailTable();
  await client().query({
    query: `
      MERGE ${ds("email_cache")} T
      USING (SELECT @taskId AS task_id, @focalHash AS focal_hash) S
      ON T.task_id = S.task_id AND T.focal_hash = S.focal_hash
      WHEN MATCHED AND T.edited_by_user IS NOT TRUE THEN UPDATE SET
        company_name = @company,
        followup_subject = @fs,
        followup_text = @ft,
        discovery_subject = @ds,
        discovery_text = @dt,
        edited_by_user = FALSE,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (task_id, focal_hash, company_name, followup_subject, followup_text,
         discovery_subject, discovery_text, edited_by_user, created_at, updated_at)
        VALUES (@taskId, @focalHash, @company, @fs, @ft, @ds, @dt,
         FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: {
      taskId: args.taskId, focalHash: args.focalHash, company: args.company,
      fs: args.followupSubject, ft: args.followupText,
      ds: args.discoverySubject, dt: args.discoveryText,
    },
    types: {
      taskId: "STRING", focalHash: "STRING", company: "STRING",
      fs: "STRING", ft: "STRING", ds: "STRING", dt: "STRING",
    },
  });
}

/** Save a user's email edit — sets edited_by_user TRUE. */
export async function updateEmailFields(args: {
  taskId: string;
  focalHash: string;
  followupSubject: string;
  followupText: string;
  discoverySubject: string;
  discoveryText: string;
}): Promise<void> {
  await ensureEmailTable();
  await client().query({
    query: `UPDATE ${ds("email_cache")} SET
        followup_subject = @fs,
        followup_text = @ft,
        discovery_subject = @ds,
        discovery_text = @dt,
        edited_by_user = TRUE,
        updated_at = CURRENT_TIMESTAMP()
      WHERE task_id = @taskId AND focal_hash = @focalHash`,
    params: {
      taskId: args.taskId, focalHash: args.focalHash,
      fs: args.followupSubject, ft: args.followupText,
      ds: args.discoverySubject, dt: args.discoveryText,
    },
    types: {
      taskId: "STRING", focalHash: "STRING",
      fs: "STRING", ft: "STRING", ds: "STRING", dt: "STRING",
    },
  });
}

function mapEmail(r: Record<string, unknown>): EmailArtifact {
  return {
    task_id: String(r.task_id),
    focal_hash: String(r.focal_hash),
    company_name: (r.company_name as string) ?? null,
    followup_subject: (r.followup_subject as string) ?? null,
    followup_text: (r.followup_text as string) ?? null,
    discovery_subject: (r.discovery_subject as string) ?? null,
    discovery_text: (r.discovery_text as string) ?? null,
    edited_by_user: (r.edited_by_user as boolean) ?? null,
    created_at: tsString(r.created_at),
    updated_at: tsString(r.updated_at),
  };
}

export async function getEmail(
  taskId: string,
  fHash: string
): Promise<{ artifact: EmailArtifact | null; stale: boolean }> {
  if (!taskId) return { artifact: null, stale: false };
  let rows: Record<string, unknown>[];
  try {
    rows = await queryRows<Record<string, unknown>>(
      `SELECT * FROM ${ds("email_cache")}
       WHERE task_id = @taskId
       ORDER BY updated_at DESC LIMIT 1`,
      { taskId }
    );
  } catch (err) {
    if (isMissingTable(err)) return { artifact: null, stale: false };
    throw err;
  }
  const r = rows[0];
  if (!r) return { artifact: null, stale: false };
  const artifact = mapEmail(r);
  return { artifact, stale: artifact.focal_hash !== fHash };
}

// ---- Company resolution mapping ------------------------------------------
// Maps a task to its real company when the Sheet account_name is a placeholder
// (see src/lib/company.ts). Kept out of the Sheet so the original marker survives.

let _resolutionTableReady = false;
async function ensureResolutionTable(): Promise<void> {
  if (_resolutionTableReady) return;
  await client().query({
    query: `CREATE TABLE IF NOT EXISTS ${ds("company_resolution")} (
      task_id STRING NOT NULL,
      account_name STRING,
      resolved_company STRING,
      used_fallback BOOL,
      updated_at TIMESTAMP
    )`,
  });
  _resolutionTableReady = true;
}

export async function upsertCompanyResolution(args: {
  taskId: string;
  accountName: string;
  company: string;
  usedFallback: boolean;
}): Promise<void> {
  if (!args.taskId) return;
  await ensureResolutionTable();
  await client().query({
    query: `
      MERGE ${ds("company_resolution")} T
      USING (SELECT @taskId AS task_id) S
      ON T.task_id = S.task_id
      WHEN MATCHED THEN UPDATE SET
        account_name = @accountName,
        resolved_company = @company,
        used_fallback = @usedFallback,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (task_id, account_name, resolved_company, used_fallback, updated_at)
        VALUES (@taskId, @accountName, @company, @usedFallback, CURRENT_TIMESTAMP())`,
    params: {
      taskId: args.taskId,
      accountName: args.accountName,
      company: args.company,
      usedFallback: args.usedFallback,
    },
    types: {
      taskId: "STRING",
      accountName: "STRING",
      company: "STRING",
      usedFallback: "BOOL",
    },
  });
}

/** Resolved company for one task, or null if none recorded. */
export async function getResolvedCompany(taskId: string): Promise<string | null> {
  if (!taskId) return null;
  try {
    const rows = await queryRows<{ resolved_company: string | null }>(
      `SELECT resolved_company FROM ${ds("company_resolution")}
       WHERE task_id = @taskId LIMIT 1`,
      { taskId }
    );
    return rows[0]?.resolved_company ?? null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** task_id -> resolved company, for annotating the whole board at once. */
export async function getResolutionMap(): Promise<Record<string, string>> {
  let rows: { task_id: string; resolved_company: string | null }[];
  try {
    rows = await queryRows<{ task_id: string; resolved_company: string | null }>(
      `SELECT task_id, resolved_company FROM ${ds("company_resolution")}`,
      {}
    );
  } catch (err) {
    if (isMissingTable(err)) return {};
    throw err;
  }
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.resolved_company) map[r.task_id] = r.resolved_company;
  }
  return map;
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
    answers: parseJson<DiscoveryAnswer[]>(r.answers, []),
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

/**
 * Fetch all artifacts for a task in parallel.
 *
 * Company resolution (needed only by research/billing, which are company-keyed)
 * runs concurrently with the task-keyed reads (solution/briefing/email) instead
 * of being awaited up front — so the resolution round-trip no longer adds to the
 * critical path. Pass `company` when it's already resolved (the generate path) to
 * skip the lookup entirely; otherwise it resolves from the task, falling back to
 * `accountName`.
 */
export async function getTaskArtifacts(args: {
  taskId: string;
  focalComment: string;
  company?: string;
  accountName?: string;
}): Promise<TaskArtifacts> {
  const fHash = focalHash(args.focalComment);
  const companyP: Promise<string> =
    args.company != null
      ? Promise.resolve(args.company)
      : getResolvedCompany(args.taskId).then((c) => c ?? args.accountName ?? "");
  const [research, billing, sol, brief, email] = await Promise.all([
    companyP.then(getResearch),
    companyP.then(getBilling),
    getSolution(args.taskId, fHash),
    getBriefing(args.taskId, fHash),
    getEmail(args.taskId, fHash),
  ]);
  return {
    focalHash: fHash,
    research,
    billing,
    solution: sol.artifact,
    briefing: brief.artifact,
    email: email.artifact,
    solutionStale: sol.stale,
    briefingStale: brief.stale,
    emailStale: email.stale,
  };
}
