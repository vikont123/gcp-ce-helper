import { readSheetRows } from "@/lib/sheets";
import { rowsToTasks, filterTasks } from "@/lib/tasks";
import { generateResearch } from "@/lib/agents/research";
import { upsertResearch, upsertCompanyResolution } from "@/lib/bigquery";
import { resolveCompanyName } from "@/lib/company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// LLM calls are slow; keep the function alive for the whole batch.
export const maxDuration = 800;

/**
 * GET /api/research/batch — Server-Sent Events.
 *
 * Resolves the active CE's unique companies from the sheet, then for each one
 * generates a grounded research artifact (Gemini facts -> Claude format) and
 * upserts it into BigQuery. Streams one `company` event per company plus a final
 * `done` event so the UI can show live per-company progress.
 */
export async function GET(req: Request) {
  const ceName = process.env.CE_FILTER_NAME || "Michael Gadaev";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const tasks = filterTasks(rowsToTasks(await readSheetRows()), ceName);

        // Resolve each task's real company (account_name is unreliable), persist
        // the mapping, then dedupe by the RESOLVED company so the same company is
        // researched once and placeholder collisions ("NotinList" x4) are split.
        const byCompany = new Map<string, { focal: string; account: string }>();
        for (const t of tasks) {
          const { company, usedFallback } = await resolveCompanyName(
            t.accountName || "",
            t.comment || ""
          );
          await upsertCompanyResolution({
            taskId: t.id,
            accountName: t.accountName || "",
            company,
            usedFallback,
          });
          if (company && !byCompany.has(company)) {
            byCompany.set(company, { focal: t.comment || "", account: t.accountName || "" });
          }
        }

        const list = [...byCompany.keys()];
        send("init", { companies: list, ceName });

        let done = 0;
        for (const company of list) {
          if (req.signal.aborted) break;
          const info = byCompany.get(company)!;
          // Show "NotinList → B2Tech" when the account name was a placeholder.
          const label = info.account && info.account !== company
            ? `${info.account} → ${company}`
            : company;
          send("company", { company, label, status: "start" });
          try {
            const { researchText, deepResearchText } = await generateResearch(
              company,
              info.focal
            );
            await upsertResearch({ company, researchText, deepResearchText });
            done++;
            send("company", { company, label, status: "done" });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            send("company", { company, label, status: "error", error: message });
          }
        }

        send("done", { total: list.length, done });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send("fatal", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
