# CE-tasker-kanban — Product Requirements (living doc)

> Lightweight PRD / source of truth for the project. Update it as scope evolves.

## 1. Vision

An AI-powered **"Tech CRM"** for Google Cloud Customer Engineers working the Israeli
market. A flat Google Sheet of customer tasks becomes an **agentic Kanban dashboard**: when a
task is opened (lands in *Todo*), agents automatically research the company, propose a GCP
architecture, surface account history, and synthesize a meeting briefing. The CE can edit every
AI output.

## 2. Users

- Primary: **Michael Gadaev**, CE at Google Cloud (and other CEs later, via login).
- Access (future): Google sign-in restricted to `@google.com`.

## 3. Data source

- Google Spreadsheet `1uxPM-EMkJLxytxsXQTyvBumlIIHJ269v6O-nOmFZtGY`, tab **`DBTask`**.
- Read via service account `mytest@mytestingenv-355509.iam.gserviceaccount.com`
  (key file `mytestingenv-gcp-coud.json`, gitignored). Sheet must be shared (Viewer) with it.
- Columns used: `ID, Created, LastUpdate, FSR, account_name, Meeting Location, Alias, CE Assigned,
  CE Assigned-2 / Manager, FSR /CE Focal Comment, CE Comments, Needs, status, specialization`.
  `CE Comments` is the CE's write-up of the work actually done (distinct from the FSR/CE focal
  comment that frames the request).

## 4. Core logic

- **Filter**: keep tasks where `CE Assigned` OR `CE Assigned-2 / Manager` contains the active CE
  name (default "Michael Gadaev"; tied to the signed-in user later).
- **Column mapping** (from `status`): `Not started` → **Todo**, `Completed` → **Completed**,
  everything else → **In Work**.

## 5. Architecture (target)

```
Next.js (UI + API + auth)
  ├── /api/tasks        → reads DBTask via service account (server-only)
  └── /api/enrich/:id   → triggers agents, streams progress (SSE)        [Phase 3]
Agent service (Node or Python)  → Company Research / GCP Architecture / Account History / Briefing
LLM: Claude via Vertex (project mytestingenv-355509)                      [Phase 3]
BigQuery (dataset ce_tasker)  → artifacts + history + analytics          [Phase 2+]
```

- **Source of truth for tasks**: the Sheet (mirrored to BigQuery for history/analytics).
- **AI artifacts + user edits**: BigQuery (table schemas TBD). Agent progress streams to the
  browser over SSE — not through the DB — so BigQuery's lack of realtime listeners is a non-issue.

## 6. API contract

- `GET /api/tasks` → `{ tasks: Task[], ceName: string }` or `{ error: string }` (403 on
  permission errors, with a hint to share the sheet). `Task` shape: see `src/lib/tasks.ts`.

## 7. BigQuery schema sketch (Phase 2 — to finalize)

- `tasks` — mirror of DBTask (one row per task) → powers Kanban + account history.
- `artifacts` — `task_id`, `type` (research|architecture|history|briefing), `content` (JSON),
  `edited_by_user` (bool), `updated_at`.
- `agent_runs` — `task_id`, `type`, `status`, `started_at`, `finished_at`, `error`, `tokens`.

## 8. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Kanban MVP (read-only), Google Material UI | **in progress** |
| 2 | BigQuery store + editable AI-artifact panel (stubs) | planned |
| 3 | Real agents + SSE streaming | planned |
| 4 | Auto-trigger on Todo (poll/webhook) | planned |
| 5 | next-auth Google login (@google.com), filter by user | planned |
| 6 | Deploy (Firebase Hosting / Cloud Run, optional IAP) | planned |

## 9. UI/UX principles

Look and feel like a first-party Google product (Material Design 3): Google blue primary,
Roboto, Material Symbols, rounded cards, soft elevation, skeleton loaders, clear empty/error
states, responsive, accessible.
