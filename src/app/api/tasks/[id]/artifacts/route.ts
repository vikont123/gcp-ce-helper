import { NextResponse } from "next/server";
import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks } from "@/lib/tasks";
import { getTaskArtifacts } from "@/lib/bigquery";

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

    const artifacts = await getTaskArtifacts({
      taskId: id,
      company: task.accountName,
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
