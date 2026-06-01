import { NextRequest, NextResponse } from "next/server";
import { readSheetRows, updateTaskFields } from "@/lib/sheets";
import { getResolutionMap } from "@/lib/bigquery";
import {
  rowsToTasks,
  filterTasks,
  COLUMN_ORDER,
  isStatusValidForColumn,
  statusForColumn,
  type ColumnId,
} from "@/lib/tasks";

// Always read fresh from the sheet (no static caching).
export const dynamic = "force-dynamic";

const SERVICE_ACCOUNT = "mytest@mytestingenv-355509.iam.gserviceaccount.com";

function isPermissionError(message: string): boolean {
  return /permission|forbidden|403|not found|404|does not have access/i.test(
    message
  );
}

export async function GET() {
  const ceName = process.env.CE_FILTER_NAME || "Michael Gadaev";

  try {
    const rows = await readSheetRows();
    const tasks = filterTasks(rowsToTasks(rows), ceName);

    // Overlay resolved real company names where account_name was a placeholder.
    // A missing map (e.g. table not created yet) must not break the board.
    try {
      const resolved = await getResolutionMap();
      for (const t of tasks) {
        if (resolved[t.id]) t.company = resolved[t.id];
      }
    } catch {
      /* resolution is best-effort; fall back to account_name */
    }

    return NextResponse.json({ tasks, ceName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermission = isPermissionError(message);

    return NextResponse.json(
      {
        error: isPermission
          ? `Cannot read the spreadsheet. Share it (Viewer) with the service account: ${SERVICE_ACCOUNT}`
          : `Failed to load tasks: ${message}`,
      },
      { status: isPermission ? 403 : 500 }
    );
  }
}

/**
 * Move a task to another Kanban column by writing its `status` (and optionally a
 * `CE Comments` note) back to the sheet. Body: { id, column, status?, ceComment? }.
 * Writing requires the sheet to be shared as Editor with the service account.
 */
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    column?: ColumnId;
    status?: string;
    ceComment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, column, status, ceComment } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing task id" }, { status: 400 });
  }
  if (!column || !COLUMN_ORDER.includes(column)) {
    return NextResponse.json(
      { error: `Invalid column: ${column}` },
      { status: 400 }
    );
  }
  // A column has a fixed set of allowed statuses; default to the column's first.
  const newStatus = status ?? statusForColumn(column);
  if (!isStatusValidForColumn(column, newStatus)) {
    return NextResponse.json(
      { error: `Status "${newStatus}" is not allowed for column "${column}"` },
      { status: 400 }
    );
  }

  try {
    await updateTaskFields(id, {
      status: newStatus,
      // Only touch CE Comments when a value was supplied (omit = leave as-is).
      ...(ceComment !== undefined ? { ceComments: ceComment } : {}),
    });
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermission = isPermissionError(message);
    return NextResponse.json(
      {
        error: isPermission
          ? `Cannot update the spreadsheet. Share it as Editor with the service account: ${SERVICE_ACCOUNT}`
          : `Failed to update task: ${message}`,
      },
      { status: isPermission ? 403 : 500 }
    );
  }
}
