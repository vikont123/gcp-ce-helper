import "server-only";
import { google } from "googleapis";

// Server-only Google Sheets access. Importing "server-only" makes the build fail
// if this module is ever pulled into a client bundle, so the service-account key
// can never leak to the browser.

const READONLY_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const READWRITE_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getSheetsClient(scopes: string[] = READONLY_SCOPES) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes,
  });
  return google.sheets({ version: "v4", auth });
}

function requireSpreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error("SPREADSHEET_ID is not set");
  return id;
}

/** Convert a 0-based column index to its A1 letter(s) (0→A, 26→AA). */
function columnLetter(index: number): string {
  let n = index;
  let letter = "";
  do {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/**
 * Read the full DBTask tab as a 2D array of strings (row 0 = headers).
 * Throws on auth/permission errors; callers turn that into a friendly API response.
 */
export async function readSheetRows(): Promise<string[][]> {
  const spreadsheetId = requireSpreadsheetId();
  const tab = process.env.SHEET_TAB || "DBTask";

  const sheets = getSheetsClient(READONLY_SCOPES);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tab,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return (res.data.values as string[][]) ?? [];
}

/** Sheet-header name for each writable Task field. */
const FIELD_HEADER = {
  status: "status",
  ceComments: "CE Comments",
} as const;

export type WritableTaskFields = Partial<Record<keyof typeof FIELD_HEADER, string>>;

/**
 * Update one or more cells of the task whose `ID` matches `id`.
 * Locates the row by ID (robust to row/column reordering) and writes only the
 * provided fields in a single batch. Requires the sheet to be shared as Editor
 * with the service account. Throws if the id (or a target column) is not found.
 */
export async function updateTaskFields(
  id: string,
  fields: WritableTaskFields
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof typeof FIELD_HEADER,
    string,
  ][];
  if (entries.length === 0) return;

  const spreadsheetId = requireSpreadsheetId();
  const tab = process.env.SHEET_TAB || "DBTask";
  const sheets = getSheetsClient(READWRITE_SCOPES);

  // 1. Header row → locate the ID column and every column we need to write.
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!1:1`,
  });
  const headers = ((headerRes.data.values?.[0] as string[]) ?? []).map((h) =>
    (h ?? "").trim()
  );
  const idCol = headers.indexOf("ID");
  if (idCol < 0) throw new Error('Sheet is missing an "ID" column');

  const targets = entries.map(([field, value]) => {
    const col = headers.indexOf(FIELD_HEADER[field]);
    if (col < 0) {
      throw new Error(`Sheet is missing a "${FIELD_HEADER[field]}" column`);
    }
    return { letter: columnLetter(col), value };
  });

  // 2. Read the ID column to find the row number for this id.
  const idLetter = columnLetter(idCol);
  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${idLetter}2:${idLetter}`,
  });
  const ids = (idRes.data.values as string[][]) ?? [];
  const offset = ids.findIndex((r) => (r[0] ?? "").trim() === id.trim());
  if (offset < 0) throw new Error(`Task ${id} not found in the sheet`);
  const rowNumber = offset + 2; // +1 for header, +1 for 1-based rows

  // 3. Write all target cells in one batch.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: targets.map((t) => ({
        range: `${tab}!${t.letter}${rowNumber}`,
        values: [[t.value]],
      })),
    },
  });
}
