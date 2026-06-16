// Pure, I/O-free task logic: types, row mapping, column placement, CE filtering.
// Kept side-effect free so it is easy to unit-test and reuse from later phases
// (agents, BigQuery sync) without dragging in the Google Sheets client.

/** The three Kanban columns. */
export type ColumnId = "todo" | "inwork" | "completed";

export const COLUMN_ORDER: ColumnId[] = ["todo", "inwork", "completed"];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: "Todo",
  inwork: "In Work",
  completed: "Completed",
};

/** A single task, mapped from one row of the DBTask sheet (header-keyed). */
export interface Task {
  /**
   * Stable per-row unique key. The sheet's `ID` column is NOT unique (~half the
   * rows share an ID), so it can't be used as a React key or dnd id — duplicate
   * keys break list reconciliation (filtered cards don't update) and drag-drop.
   * Derived from the row position at load; never written back to the sheet.
   */
  uid: string;
  id: string;
  created: string;
  lastUpdate: string;
  fsr: string;
  accountName: string;
  /**
   * Real customer company for display and company-keyed lookups. Defaults to
   * accountName; overridden server-side when account_name is a placeholder
   * (see src/lib/company.ts and the resolution map in src/lib/bigquery.ts).
   */
  company: string;
  meetingLocation: string;
  alias: string;
  ceAssigned: string;
  ceAssigned2: string;
  comment: string;
  /** CE's write-up of the work actually done (sheet column "CE Comments"). */
  ceComments: string;
  needs: string;
  status: string;
  specialization: string;
  /** Derived Kanban column from `status`. */
  column: ColumnId;
}

/**
 * Exact header strings as they appear in row 0 of the DBTask sheet, mapped to
 * the Task field they populate. Mapping by header name (not position) keeps us
 * robust to column reordering in the sheet.
 */
const HEADER_TO_FIELD: Record<string, keyof Task> = {
  ID: "id",
  Created: "created",
  LastUpdate: "lastUpdate",
  FSR: "fsr",
  account_name: "accountName",
  "Meeting Location": "meetingLocation",
  Alias: "alias",
  "CE Assigned": "ceAssigned",
  "CE Assigned-2 / Manager": "ceAssigned2",
  "FSR /CE Focal Comment": "comment",
  "CE Comments": "ceComments",
  Needs: "needs",
  status: "status",
  specialization: "specialization",
};

/** Map a status string to its Kanban column (case-insensitive, trimmed). */
export function columnFor(status: string): ColumnId {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "not started") return "todo";
  // "Deprecated" is offered as a Completed-column choice, so it lands there too.
  if (s === "completed" || s === "deprecated") return "completed";
  return "inwork";
}

/**
 * Allowed `status` values to write back per Kanban column. When a card is dragged
 * into In Work / Completed the user picks one of these in a dialog; Todo has a
 * single value so it is written directly. Each value still maps back to its
 * column via `columnFor`. Order matters: the first entry is the default.
 */
export const STATUS_OPTIONS: Record<ColumnId, string[]> = {
  todo: ["Not started"],
  inwork: [
    "In progress",
    "Waiting for customer",
    "Waiting for FSR",
    "In Research",
    "Started",
  ],
  completed: ["Completed", "Deprecated"],
};

/** Default `status` value to write when a task is dragged into a column. */
export function statusForColumn(column: ColumnId): string {
  return STATUS_OPTIONS[column][0];
}

/** Is `status` a valid choice for `column`? (used to validate writes). */
export function isStatusValidForColumn(
  column: ColumnId,
  status: string
): boolean {
  return STATUS_OPTIONS[column].includes(status);
}

/**
 * Does a task belong to the given CE? Matches either assignment column,
 * case-insensitive and trimmed, using "contains" so a cell holding multiple
 * names (or extra whitespace) still matches.
 */
export function matchesCE(task: Task, ceName: string): boolean {
  const needle = (ceName ?? "").trim().toLowerCase();
  if (!needle) return true;
  const hay = `${task.ceAssigned} ${task.ceAssigned2}`.toLowerCase();
  return hay.includes(needle);
}

/**
 * Convert raw sheet values (first row = headers) into Task objects.
 * Unknown headers are ignored; missing cells become empty strings.
 */
export function rowsToTasks(rows: string[][]): Task[] {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map((h) => (h ?? "").trim());

  return rows.slice(1).map((row, index) => {
    const task: Task = {
      uid: `row-${index}`,
      id: "",
      created: "",
      lastUpdate: "",
      fsr: "",
      accountName: "",
      company: "",
      meetingLocation: "",
      alias: "",
      ceAssigned: "",
      ceAssigned2: "",
      comment: "",
      ceComments: "",
      needs: "",
      status: "",
      specialization: "",
      column: "inwork",
    };

    headers.forEach((header, i) => {
      const field = HEADER_TO_FIELD[header];
      if (field && field !== "column") {
        task[field] = (row[i] ?? "").toString().trim();
      }
    });

    task.column = columnFor(task.status);
    // Default the display company to account_name; the API layer overrides it
    // with the resolved real company when one was recorded.
    task.company = task.accountName;
    return task;
  });
}

/** Filter to a CE then drop rows with no identifying data (blank trailing rows). */
export function filterTasks(tasks: Task[], ceName: string): Task[] {
  return tasks.filter(
    (t) => (t.id || t.accountName) && matchesCE(t, ceName)
  );
}

/**
 * Is this task assigned to `ceName` on the primary "CE Assigned" column?
 * Stricter than {@link matchesCE} (which also matches the manager column) so the
 * header picker shows only the cards that CE actually owns — not ones where they
 * merely appear as manager. Empty `ceName` matches everything ("All CEs").
 */
export function isAssignedToCE(task: Task, ceName: string): boolean {
  const needle = (ceName ?? "").trim().toLowerCase();
  if (!needle) return true;
  return (task.ceAssigned ?? "").trim().toLowerCase() === needle;
}

/**
 * Distinct CE names found on the tasks (from the "CE Assigned" column), sorted
 * alphabetically. Drives the CE picker in the header so the user can switch
 * which CE's board they are looking at.
 */
export function listCEs(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    const name = (t.ceAssigned ?? "").trim();
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
