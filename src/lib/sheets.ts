import "server-only";
import { google } from "googleapis";

// Server-only Google Sheets access. Importing "server-only" makes the build fail
// if this module is ever pulled into a client bundle, so the service-account key
// can never leak to the browser.

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: SCOPES,
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Read the full DBTask tab as a 2D array of strings (row 0 = headers).
 * Throws on auth/permission errors; callers turn that into a friendly API response.
 */
export async function readSheetRows(): Promise<string[][]> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const tab = process.env.SHEET_TAB || "DBTask";
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set");
  }

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tab,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return (res.data.values as string[][]) ?? [];
}
