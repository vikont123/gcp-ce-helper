# ce-tasker

An AI-assisted **Tech-CRM / Kanban board for Google Cloud Customer Engineers** (Israeli market). It turns a shared Google Sheet of customer tasks into a drag-and-drop Kanban board and enriches each account with on-demand, AI-generated research, solution designs, and briefings — caching the results in BigQuery.

- **Live:** https://ce-tasker-551627533050.us-central1.run.app (Cloud Run, `us-central1`, project `mytestingenv-355509`)
- **Access:** Google OAuth, restricted to `@google.com` and `@michaelgadaev.altostrat.com`.

---

## What it does

- **Kanban over a Google Sheet.** The Sheet is the system of record for tasks (one row per task). The app reads it, groups tasks into columns by status, and lets you drag cards between columns. Moves are written back to the Sheet with a mandatory, tagged move-comment.
- **Per-CE view.** A picker filters the board to the signed-in CE's own tasks (`CE_FILTER_NAME`).
- **Company resolution.** The Sheet's `account_name` is unreliable (placeholders like `NotinList` / `EarlyStage`). The app resolves the real company from the task's focal comment — a deterministic `Customer: <Name>` fast-path first, then a Gemini fallback — and caches the mapping.
- **AI enrichment (on demand, per account).** From a task drawer you can generate:
  - **Research** — grounded company/account background.
  - **Solution** — a concrete GCP architecture tied to the customer's request.
  - **Briefing** — a pre-meeting brief.
  - **Account insight** — a short AI summary shown in the History tab.
  Generated artifacts are cached in BigQuery so repeat opens are instant.

## Architecture

```
Browser (MUI + @dnd-kit Kanban)
    │  Next.js App Router (RSC + API routes)
    ▼
NextAuth (Google OAuth, domain-gated)  ──  src/middleware.ts gates every route
    │
    ├── Google Sheets API (googleapis)   → tasks: read + write-back    [system of record]
    ├── BigQuery (@google-cloud/bigquery) → AI-artifact caches          [dataset gcp_crm_data]
    └── Gemini (Developer API, GOOGLE_API_KEY, @google/genai)
            • MODEL_PRO   — formatting / structured answers
            • MODEL_FLASH — grounded factual lookups
```

### Key modules
| Path | Responsibility |
|------|----------------|
| `src/middleware.ts` | Auth gate for all routes (NextAuth). |
| `src/auth.ts` | NextAuth v5 config, Google provider, domain allow-list. |
| `src/lib/sheets.ts` | Google Sheets read/write + in-memory cache (`SHEET_CACHE_TTL_MS`). |
| `src/lib/tasks.ts` | Maps Sheet rows → `Task` objects. Uses `Task.uid` for identity (the Sheet `id` column is **not** unique). |
| `src/lib/company.ts` | Resolves the real company name from placeholders / focal comments. |
| `src/lib/bigquery.ts` | Read/MERGE AI-artifact caches in `gcp_crm_data`. |
| `src/lib/llm.ts` | Gemini client (Developer API via `GOOGLE_API_KEY`). |
| `src/app/api/*` | Route handlers: `tasks`, `tasks/[id]/artifacts`, `tasks/[id]/generate`, `research/batch`, `auth`. |
| `src/components/*` | Board, Column, TaskCard, TaskDrawer, dialogs (MUI). |

> **Identity gotcha:** the Sheet's `id` column has duplicates (~half). Always use `Task.uid` for React keys, dnd, and identity — never `id`.

## Tech stack

Next.js 15 (App Router, standalone output) · React 19 · TypeScript · MUI 6 · @dnd-kit · NextAuth v5 · `googleapis` (Sheets) · `@google-cloud/bigquery` · `@google/genai` (Gemini).

## Environment variables

| Var | Purpose |
|-----|---------|
| `SPREADSHEET_ID` | Source Google Sheet ID. |
| `SHEET_TAB` | Tab name to read. |
| `CE_FILTER_NAME` | Default CE filter. |
| `SHEET_CACHE_TTL_MS` | In-memory Sheet cache TTL (optional). |
| `BIGQUERY_PROJECT_ID` | BigQuery project (defaults to `mytestingenv-355509`). |
| `BIGQUERY_DATASET` | Cache dataset (defaults to `gcp_crm_data`). |
| `GOOGLE_API_KEY` | Gemini Developer API key. |
| `MODEL_PRO`, `MODEL_FLASH` | Gemini model IDs. |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Local dev only** — path to a SA key for Sheets/BigQuery. In prod this is **omitted** so clients use ADC (the Cloud Run runtime SA). |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client. |
| `AUTH_SECRET` | NextAuth secret. |
| `AUTH_URL` | Public URL NextAuth builds callbacks against — **must** equal the live URL in prod. |
| `AUTH_TRUST_HOST` | `true` behind Cloud Run. |

## Local development

```bash
npm install
# .env.local with the vars above; for local dev set GOOGLE_APPLICATION_CREDENTIALS
# to a SA key that can read the Sheet + access BigQuery.
npm run dev            # http://localhost:3000
```

The Sheet must be shared (Viewer) with whatever identity the app runs as — the SA key locally, or the runtime SA in prod.

## Deployment (Cloud Run)

The service is containerized via a multi-stage `Dockerfile` (Next.js **standalone** output) and built from source by Cloud Build. There is **no Skaffold / Cloud Code config** — deploys go through `gcloud run deploy --source .`.

**Prerequisites**
- Deploy from an **owner account** (`gcloud auth login` as `admin@michaelgadaev.altostrat.com`). The runtime SA cannot deploy itself.
- Regenerate the env-vars file from `.env.local`, but: set `AUTH_URL` to the live URL and **omit** `GOOGLE_APPLICATION_CREDENTIALS` (prod uses ADC).

**Deploy**
```bash
gcloud run deploy ce-tasker --source . \
  --project mytestingenv-355509 \
  --region us-central1 \
  --service-account ce-tasker-run@mytestingenv-355509.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --env-vars-file /tmp/ce-env.yaml
```
`--allow-unauthenticated` is safe because NextAuth gates access by domain at the edge (`src/middleware.ts`).

### Runtime identity & least privilege
The service runs as a **dedicated, least-privilege** service account `ce-tasker-run@…` with only:
- `roles/bigquery.dataEditor` (read + MERGE + create cache tables)
- `roles/bigquery.jobUser` (run query jobs)

Sheets access is granted by **sharing the spreadsheet** (Viewer) with the runtime SA — not via IAM. Gemini uses `GOOGLE_API_KEY`, so no Vertex/`aiplatform` role is needed.

## Security notes

- **CVE-2025-29927** (Next.js middleware auth-bypass via `x-middleware-subrequest`) is patched — the app runs `next ≥ 15.5.27`. Do not downgrade below the patched line.
- Keep the runtime SA minimal. Do **not** reattach broad roles (`*.admin`) or the shared `mytest@` SA to the internet-facing service.
- Avoid long-lived SA keys; prefer ADC in prod and `gcloud auth application-default login` locally.
