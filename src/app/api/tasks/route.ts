import { NextResponse } from "next/server";
import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks, filterTasks } from "@/lib/tasks";

// Always read fresh from the sheet (no static caching).
export const dynamic = "force-dynamic";

const SERVICE_ACCOUNT = "mytest@mytestingenv-355509.iam.gserviceaccount.com";

export async function GET() {
  const ceName = process.env.CE_FILTER_NAME || "Michael Gadaev";

  try {
    const rows = await readSheetRows();
    const tasks = filterTasks(rowsToTasks(rows), ceName);
    return NextResponse.json({ tasks, ceName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermission =
      /permission|forbidden|403|not found|404|does not have access/i.test(message);

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
