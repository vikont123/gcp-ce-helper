import { NextResponse } from "next/server";
import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks } from "@/lib/tasks";
import {
  focalHash,
  getTaskArtifacts,
  getResolvedCompany,
  updateResearchText,
  updateSolutionFields,
  updateBriefingText,
  updateEmailFields,
  updateInsightText,
  type DiscoveryQuestion,
} from "@/lib/bigquery";

// Read fresh each time; artifacts can change between visits.
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/:id/artifacts
 * Resolves the task from the sheet (server-authoritative for company name and
 * focal comment), then returns its cached AI artifacts from BigQuery.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing task id" }, { status: 400 });
  }

  try {
    const rows = await readSheetRows();
    const task = rowsToTasks(rows).find((t) => t.id === id);
    if (!task) {
      return NextResponse.json(
        { error: `Task ${id} not found` },
        { status: 404 }
      );
    }

    // Research/billing are keyed by company; account_name may be a placeholder,
    // so getTaskArtifacts resolves the real company (recorded during generation)
    // concurrently with the task-keyed reads, falling back to account_name.
    const artifacts = await getTaskArtifacts({
      taskId: id,
      accountName: task.accountName,
      focalComment: task.comment,
    });

    return NextResponse.json({ artifacts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermission =
      /permission|forbidden|403|not found|404|does not have access/i.test(
        message
      );
    return NextResponse.json(
      { error: `Failed to load artifacts: ${message}` },
      { status: isPermission ? 403 : 500 }
    );
  }
}

/**
 * PATCH /api/tasks/:id/artifacts  body: { type, fields }
 * Saves a CE's edit to an artifact (marks edited_by_user TRUE so generation won't
 * overwrite it), then returns the refreshed artifact set.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { type?: string; fields?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { type, fields = {} } = body;

  try {
    const task = rowsToTasks(await readSheetRows()).find((t) => t.id === id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }
    const company = (await getResolvedCompany(id)) ?? task.accountName;
    const fHash = focalHash(task.comment || "");

    if (type === "research") {
      await updateResearchText(company, String(fields.researchText ?? ""));
    } else if (type === "insight") {
      await updateInsightText(company, String(fields.insightText ?? ""));
    } else if (type === "solution") {
      await updateSolutionFields({
        taskId: id,
        focalHash: fHash,
        problemUnderstanding: String(fields.problemUnderstanding ?? ""),
        primarySolution: String(fields.primarySolution ?? ""),
        discoveryQuestions: (fields.discoveryQuestions as DiscoveryQuestion[]) ?? [],
      });
    } else if (type === "briefing") {
      await updateBriefingText({
        taskId: id,
        focalHash: fHash,
        briefingText: String(fields.briefingText ?? ""),
      });
    } else if (type === "email") {
      await updateEmailFields({
        taskId: id,
        focalHash: fHash,
        followupSubject: String(fields.followupSubject ?? ""),
        followupText: String(fields.followupText ?? ""),
        discoverySubject: String(fields.discoverySubject ?? ""),
        discoveryText: String(fields.discoveryText ?? ""),
      });
    } else {
      return NextResponse.json({ error: `Unknown artifact type: ${type}` }, { status: 400 });
    }

    const artifacts = await getTaskArtifacts({
      taskId: id,
      company,
      focalComment: task.comment,
    });
    return NextResponse.json({ artifacts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to save edit: ${message}` }, { status: 500 });
  }
}
