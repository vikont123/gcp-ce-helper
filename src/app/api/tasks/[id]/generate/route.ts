import { NextResponse } from "next/server";
import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks } from "@/lib/tasks";
import {
  focalHash,
  getResearch,
  getSolution,
  getTaskArtifacts,
  upsertResearch,
  upsertSolution,
  upsertBriefing,
  upsertCompanyResolution,
} from "@/lib/bigquery";
import { resolveCompanyName } from "@/lib/company";
import { generateResearch } from "@/lib/agents/research";
import { generateSolution } from "@/lib/agents/solution";
import { generateBriefing } from "@/lib/agents/briefing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

type GenType = "research" | "solution" | "briefing" | "all";

/**
 * POST /api/tasks/:id/generate  body: { type }
 * Generates one artifact (or all, chained research→solution→briefing) for a task
 * and returns the refreshed artifact set. Placeholder account names are resolved
 * to the real company first (and the mapping is persisted).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { type?: GenType };
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

    // Resolve the real company (account_name may be a placeholder) and persist it.
    const { company, usedFallback } = await resolveCompanyName(task.accountName || "", focal);
    await upsertCompanyResolution({
      taskId: id,
      accountName: task.accountName || "",
      company,
      usedFallback,
    });

    const doResearch = type === "research" || type === "all";
    const doSolution = type === "solution" || type === "all";
    const doBriefing = type === "briefing" || type === "all";

    // Research (company-keyed). Keep the text in memory to feed later stages.
    let researchText: string | null = null;
    if (doResearch) {
      const r = await generateResearch(company, focal);
      await upsertResearch({ company, researchText: r.researchText, deepResearchText: r.deepResearchText });
      researchText = r.researchText;
    } else {
      researchText = (await getResearch(company))?.research_text ?? null;
    }

    // Solution (task_id + focal_hash).
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
    } else if (doBriefing) {
      const existing = await getSolution(id, fHash);
      problem = existing.artifact?.problem_understanding ?? null;
      primary = existing.artifact?.primary_solution ?? null;
    }

    // Briefing (task_id + focal_hash), synthesizes the above.
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
