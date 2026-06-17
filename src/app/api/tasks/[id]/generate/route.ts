import { NextResponse } from "next/server";
import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks } from "@/lib/tasks";
import {
  focalHash,
  getResearch,
  getSolution,
  getBriefing,
  getResolvedCompany,
  getTaskArtifacts,
  upsertResearch,
  upsertSolution,
  upsertSolutionRefinement,
  upsertBriefing,
  upsertEmail,
  upsertInsight,
  upsertCompanyResolution,
  type DiscoveryAnswer,
} from "@/lib/bigquery";
import { resolveCompanyName } from "@/lib/company";
import { generateResearch } from "@/lib/agents/research";
import { generateSolution, generateRefinedSolution } from "@/lib/agents/solution";
import { generateBriefing } from "@/lib/agents/briefing";
import { generateEmail } from "@/lib/agents/email";
import { generateCompanyInsight, type InsightTask } from "@/lib/agents/insight";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

type GenType =
  | "research"
  | "solution"
  | "briefing"
  | "email"
  | "refine"
  | "insight"
  | "all";

/**
 * POST /api/tasks/:id/generate  body: { type, answers?, comment? }
 * Generates one artifact (or "all", chained research→solution→briefing→email) and
 * returns the refreshed artifact set. Single-type calls read upstream artifacts
 * from BigQuery, so the client can drive the chain as short sequential requests.
 * `type: "refine"` regenerates the solution from the customer's discovery answers
 * (`answers`) plus extra context (`comment`). Placeholder account names are
 * resolved to the real company once and reused across the chain.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: {
    type?: GenType;
    answers?: DiscoveryAnswer[];
    comment?: string;
    tasks?: InsightTask[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const type = body.type ?? "all";

  try {
    const task = rowsToTasks(await readSheetRows()).find((t) => t.id === id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const focal = task.comment || "";
    const fHash = focalHash(focal);

    // Resolve the real company once. Reuse a previously-recorded resolution so the
    // chained requests don't each pay for the (LLM-backed) resolution step.
    let company = await getResolvedCompany(id);
    if (!company) {
      const resolved = await resolveCompanyName(task.accountName || "", focal);
      company = resolved.company;
      await upsertCompanyResolution({
        taskId: id,
        accountName: task.accountName || "",
        company,
        usedFallback: resolved.usedFallback,
      });
    }

    // Refine is its own path: regenerate the solution from the customer's answers.
    if (type === "refine") {
      const { artifact: sol } = await getSolution(id, fHash);
      if (!sol) {
        return NextResponse.json(
          { error: "No solution to refine — generate the solution first." },
          { status: 404 }
        );
      }
      const research = (await getResearch(company))?.research_text ?? undefined;
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const comment = body.comment ?? "";
      const { refinedSolution } = await generateRefinedSolution({
        company,
        focal,
        research,
        problemUnderstanding: sol.problem_understanding ?? "",
        primarySolution: sol.primary_solution ?? "",
        discoveryQuestions: sol.discovery_questions ?? [],
        answers,
        comment,
      });
      await upsertSolutionRefinement({
        taskId: id,
        focalHash: fHash,
        answers,
        additionalContext: comment,
        refinedSolution,
      });
      const artifacts = await getTaskArtifacts({ taskId: id, company, focalComment: focal });
      return NextResponse.json({ artifacts });
    }

    // Insight is company-scoped: it reasons over ALL of the company's tasks, which
    // the client (which already holds the resolved board) sends in `tasks`.
    if (type === "insight") {
      const research = (await getResearch(company))?.research_text ?? undefined;
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      const { insightText, tasksHash } = await generateCompanyInsight({
        company,
        tasks,
        research,
      });
      await upsertInsight({ company, insightText, tasksHash });
      const artifacts = await getTaskArtifacts({ taskId: id, company, focalComment: focal });
      return NextResponse.json({ artifacts });
    }

    const doResearch = type === "research" || type === "all";
    const doSolution = type === "solution" || type === "all";
    const doBriefing = type === "briefing" || type === "all";
    const doEmail = type === "email" || type === "all";

    // Research (company-keyed). Keep the text in memory to feed later stages.
    let researchText: string | null = null;
    if (doResearch) {
      const r = await generateResearch(company, focal);
      await upsertResearch({ company, researchText: r.researchText, deepResearchText: r.deepResearchText });
      researchText = r.researchText;
    } else if (doSolution || doBriefing || doEmail) {
      researchText = (await getResearch(company))?.research_text ?? null;
    }

    // Solution (task_id + focal_hash). Downstream stages prefer a refined solution.
    let problem: string | null = null;
    let primary: string | null = null;
    if (doSolution) {
      const s = await generateSolution({ company, focal, research: researchText ?? undefined });
      await upsertSolution({
        taskId: id,
        focalHash: fHash,
        company,
        problemUnderstanding: s.problemUnderstanding,
        primarySolution: s.primarySolution,
        discoveryQuestions: s.discoveryQuestions,
      });
      problem = s.problemUnderstanding;
      primary = s.primarySolution;
    } else if (doBriefing || doEmail) {
      const { artifact } = await getSolution(id, fHash);
      problem = artifact?.problem_understanding ?? null;
      primary = artifact?.refined_solution ?? artifact?.primary_solution ?? null;
    }

    // Briefing (task_id + focal_hash), synthesizes the above.
    let briefingText: string | null = null;
    if (doBriefing) {
      const b = await generateBriefing({
        company,
        focal,
        research: researchText ?? undefined,
        problemUnderstanding: problem ?? undefined,
        primarySolution: primary ?? undefined,
      });
      await upsertBriefing({
        taskId: id,
        focalHash: fHash,
        company,
        briefingText: b.briefingText,
        inputsHash: b.inputsHash,
      });
      briefingText = b.briefingText;
    } else if (doEmail) {
      briefingText = (await getBriefing(id, fHash)).artifact?.briefing_text ?? null;
    }

    // Email (task_id + focal_hash): two customer-facing templates.
    if (doEmail) {
      const e = await generateEmail({
        company,
        focal,
        research: researchText ?? undefined,
        problemUnderstanding: problem ?? undefined,
        primarySolution: primary ?? undefined,
        briefing: briefingText ?? undefined,
      });
      await upsertEmail({
        taskId: id,
        focalHash: fHash,
        company,
        followupSubject: e.followupSubject,
        followupText: e.followupText,
        discoverySubject: e.discoverySubject,
        discoveryText: e.discoveryText,
      });
    }

    const artifacts = await getTaskArtifacts({ taskId: id, company, focalComment: focal });
    return NextResponse.json({ artifacts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Generation failed: ${message}` },
      { status: 500 }
    );
  }
}
