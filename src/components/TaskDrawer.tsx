"use client";

import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EditIcon from "@mui/icons-material/Edit";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Markdown, { EmptyState } from "@/components/Markdown";
import { COLUMN_LABELS, type Task } from "@/lib/tasks";
import { avatarColor, initials, COLUMN_COLOR } from "@/lib/ui";
import type { TaskArtifacts, DiscoveryQuestion, DiscoveryAnswer } from "@/lib/bigquery";

const TABS = [
  "Overview",
  "Research",
  "Solution",
  "Briefing",
  "Email",
  "History",
] as const;

type ArtifactType = "research" | "solution" | "briefing" | "email";
/** Artifacts a CE can inline-edit (single-body ones reuse `draftText`). */
type EditableType = ArtifactType | "insight";

/** A generation stage the client can drive; "refine" carries answers + comment. */
type GenStage = {
  type: ArtifactType | "refine" | "insight";
  body?: Record<string, unknown>;
};

const STAGE_LABELS: Record<string, string> = {
  research: "Generating research…",
  solution: "Generating solution…",
  briefing: "Generating briefing…",
  email: "Generating email…",
  refine: "Refining solution…",
  insight: "Generating insight…",
};

/**
 * Parse a fetch Response as JSON, tolerating non-JSON bodies. Long generations
 * can hit a proxy/server timeout that returns an HTML error page; this surfaces
 * a readable message instead of "Unexpected token '<'".
 */
async function parseJsonResponse(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(
        `Server error (${res.status}${res.statusText ? ` ${res.statusText}` : ""})` +
          " — the request may have timed out. Try generating tabs one at a time."
      );
    }
    const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(`Unexpected non-JSON response: ${snippet}`);
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Tooltip title={done ? "Copied" : "Copy"}>
      <IconButton
        size="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            /* clipboard may be unavailable; ignore */
          }
        }}
      >
        {done ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

/** Header row above an artifact: title, freshness, edited badge, copy. */
function ArtifactHeader({
  title,
  updatedAt,
  edited,
  copyText,
}: {
  title: string;
  updatedAt?: string | null;
  edited?: boolean | null;
  copyText?: string;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, flexGrow: 1 }}>
        {title}
      </Typography>
      {edited && (
        <Chip
          icon={<EditNoteIcon />}
          label="Edited"
          size="small"
          variant="outlined"
          color="warning"
        />
      )}
      {updatedAt && (
        <Typography variant="caption" color="text.secondary">
          {new Date(updatedAt).toLocaleString()}
        </Typography>
      )}
      {copyText && <CopyButton text={copyText} />}
    </Stack>
  );
}

/** Generate / Regenerate / Edit row shown at the top of each artifact tab. */
function TabActions({
  present,
  type,
  busyLabel,
  disabled,
  onGenerate,
  onEdit,
}: {
  present: boolean;
  type: ArtifactType;
  busyLabel: string | null;
  /** True while any generation is in flight (e.g. "Generate all"). */
  disabled: boolean;
  onGenerate: (t: ArtifactType) => void;
  onEdit: () => void;
}) {
  const busy = busyLabel !== null;
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
      <Button
        size="small"
        variant={present ? "outlined" : "contained"}
        startIcon={
          busy ? (
            <CircularProgress size={14} color="inherit" />
          ) : present ? (
            <RefreshIcon />
          ) : (
            <AutoAwesomeIcon />
          )
        }
        disabled={busy || disabled}
        onClick={() => onGenerate(type)}
      >
        {busy ? busyLabel : present ? "Regenerate" : "Generate"}
      </Button>
      {present && (
        <Button
          size="small"
          startIcon={<EditIcon />}
          disabled={busy || disabled}
          onClick={onEdit}
        >
          Edit
        </Button>
      )}
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value || "—"}</Typography>
    </Box>
  );
}

function TabPanel({
  value,
  index,
  children,
}: {
  value: number;
  index: number;
  children: React.ReactNode;
}) {
  if (value !== index) return null;
  return <Box sx={{ py: 2 }}>{children}</Box>;
}

function LoadingBlock() {
  return (
    <Box>
      <Skeleton width="40%" />
      <Skeleton />
      <Skeleton />
      <Skeleton width="80%" />
    </Box>
  );
}

/** Save / Cancel footer shared by every edit form. */
function EditActions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
      <Button
        variant="contained"
        size="small"
        disabled={saving}
        startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <CheckIcon />}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button size="small" color="inherit" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </Stack>
  );
}

export default function TaskDrawer({
  task,
  allTasks,
  onOpenTask,
  onClose,
}: {
  task: Task | null;
  allTasks: Task[];
  onOpenTask: (t: Task) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState(0);
  const [data, setData] = React.useState<TaskArtifacts | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Generation: a label like "Generating solution…" while a POST is in flight.
  const [busy, setBusy] = React.useState<string | null>(null);
  // Inline editing: which artifact is being edited + its working copy + save state.
  const [editing, setEditing] = React.useState<EditableType | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [draftText, setDraftText] = React.useState(""); // research / briefing body
  const [draftProblem, setDraftProblem] = React.useState("");
  const [draftPrimary, setDraftPrimary] = React.useState("");
  const [draftQuestions, setDraftQuestions] = React.useState<DiscoveryQuestion[]>([]);
  // Email edit drafts (two templates, each subject + body).
  const [draftFollowupSubject, setDraftFollowupSubject] = React.useState("");
  const [draftFollowupText, setDraftFollowupText] = React.useState("");
  const [draftDiscoverySubject, setDraftDiscoverySubject] = React.useState("");
  const [draftDiscoveryText, setDraftDiscoveryText] = React.useState("");
  // Refine inputs: one answer per discovery question (by index) + extra context.
  const [draftAnswers, setDraftAnswers] = React.useState<string[]>([]);
  const [draftComment, setDraftComment] = React.useState("");

  const open = Boolean(task);
  const title = task ? task.company || task.accountName || `Task ${task.id}` : "";
  const color = task ? COLUMN_COLOR[task.column] : null;
  const taskId = task?.id;

  const reload = React.useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/artifacts`);
      const body = await parseJsonResponse(res);
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setData(body.artifacts as TaskArtifacts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Load artifacts + reset transient UI whenever a (different) task opens.
  React.useEffect(() => {
    setEditing(null);
    setBusy(null);
    if (!taskId) {
      setData(null);
      return;
    }
    setTab(0);
    setData(null);
    reload();
  }, [taskId, reload]);

  // Seed the refine inputs from the stored solution. Keyed on the solution's
  // updated_at so it re-seeds after a (re)generate or refine, but never clobbers
  // what the user is typing between those events.
  React.useEffect(() => {
    const sol = data?.solution;
    const questions = (Array.isArray(sol?.discovery_questions) ? sol.discovery_questions : [])
      .filter((q) => q && typeof q.question === "string");
    const stored = new Map(
      (Array.isArray(sol?.answers) ? sol.answers : [])
        .filter((a) => a && typeof a.question === "string")
        .map((a) => [a.question.trim(), a.answer ?? ""] as const)
    );
    setDraftAnswers(questions.map((q) => stored.get(q.question.trim()) ?? ""));
    setDraftComment(sol?.additional_context ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, data?.solution?.updated_at]);

  // Run generation stages as short sequential requests (one LLM call each), so a
  // long chain never trips the gateway timeout. UI refreshes after every stage and
  // the chain stops on the first error.
  const runChain = async (stages: GenStage[]) => {
    if (!taskId) return;
    setError(null);
    try {
      for (const stage of stages) {
        setBusy(STAGE_LABELS[stage.type] ?? "Working…");
        const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: stage.type, ...(stage.body ?? {}) }),
        });
        const body = await parseJsonResponse(res);
        if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
        setData(body.artifacts as TaskArtifacts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const generate = (type: ArtifactType | "all") =>
    type === "all"
      ? runChain([{ type: "research" }, { type: "solution" }, { type: "briefing" }, { type: "email" }])
      : runChain([{ type }]);

  // Refine: send the customer's answers + comment, then regenerate briefing + email.
  const refine = () => {
    const answers: DiscoveryAnswer[] = (data?.solution?.discovery_questions ?? []).map(
      (q, i) => ({ question: q.question, answer: (draftAnswers[i] ?? "").trim() })
    );
    return runChain([
      { type: "refine", body: { answers, comment: draftComment } },
      { type: "briefing" },
      { type: "email" },
    ]);
  };

  // All tasks of this task's company (resolved name, case-insensitive). The insight
  // reasons over the full set (incl. the open task); the table shows only the others.
  const companyKey = (task?.company ?? "").trim().toLowerCase();
  const companyTasks = React.useMemo(() => {
    if (!companyKey) return [] as Task[];
    const seen = new Set<string>();
    const out: Task[] = [];
    for (const t of allTasks) {
      if ((t.company ?? "").trim().toLowerCase() !== companyKey) continue;
      const sig = [t.id, t.column, t.status, t.ceAssigned, t.comment, t.ceComments].join(
        ""
      );
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(t);
    }
    return out;
  }, [allTasks, companyKey]);
  // Other tasks of the company, with exact-duplicate sheet rows collapsed. The
  // sheet's ID column is not unique and some rows are full duplicates (same id,
  // CE, status, comment), so dedup on the displayed content rather than id/uid.
  const historyTasks = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Task[] = [];
    for (const t of companyTasks) {
      if (t.uid === task?.uid) continue;
      const sig = [t.id, t.column, t.status, t.ceAssigned, t.comment, t.ceComments]
        .join("");
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(t);
    }
    return out;
  }, [companyTasks, task?.uid]);

  // Insight: account-level synthesis across ALL of the company's tasks.
  const generateInsight = () =>
    runChain([
      {
        type: "insight",
        body: {
          tasks: companyTasks.map((t) => ({
            id: t.id,
            comment: t.comment,
            ceComments: t.ceComments,
            status: t.status,
            ceAssigned: t.ceAssigned,
            specialization: t.specialization,
            needs: t.needs,
          })),
        },
      },
    ]);

  // Auto-generate the insight the first time the History tab is opened for a task
  // whose company has no cached insight yet. Cache is company-keyed, so this fires
  // at most once per company. The ref guards against re-firing (incl. on failure).
  const insightAutoRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (tab !== 5 || !taskId || loading || busy) return;
    if (!data || data.insight?.insight_text) return;
    if (companyTasks.length === 0) return;
    if (insightAutoRef.current === taskId) return;
    insightAutoRef.current = taskId;
    generateInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, taskId, loading, busy, data, companyTasks.length]);

  const startEdit = (type: EditableType) => {
    if (type === "research") setDraftText(data?.research?.research_text ?? "");
    if (type === "briefing") setDraftText(data?.briefing?.briefing_text ?? "");
    if (type === "insight") setDraftText(data?.insight?.insight_text ?? "");
    if (type === "solution") {
      setDraftProblem(data?.solution?.problem_understanding ?? "");
      setDraftPrimary(data?.solution?.primary_solution ?? "");
      setDraftQuestions(data?.solution?.discovery_questions ?? []);
    }
    if (type === "email") {
      setDraftFollowupSubject(data?.email?.followup_subject ?? "");
      setDraftFollowupText(data?.email?.followup_text ?? "");
      setDraftDiscoverySubject(data?.email?.discovery_subject ?? "");
      setDraftDiscoveryText(data?.email?.discovery_text ?? "");
    }
    setEditing(type);
  };

  const saveEdit = async () => {
    if (!taskId || !editing) return;
    const fields =
      editing === "research"
        ? { researchText: draftText }
        : editing === "insight"
          ? { insightText: draftText }
          : editing === "briefing"
          ? { briefingText: draftText }
          : editing === "email"
            ? {
                followupSubject: draftFollowupSubject,
                followupText: draftFollowupText,
                discoverySubject: draftDiscoverySubject,
                discoveryText: draftDiscoveryText,
              }
            : {
                problemUnderstanding: draftProblem,
                primarySolution: draftPrimary,
                discoveryQuestions: draftQuestions.filter((q) => q.question.trim()),
              };
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/artifacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: editing, fields }),
      });
      const body = await parseJsonResponse(res);
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setData(body.artifacts as TaskArtifacts);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Pipeline status dots: ✓ when the artifact exists.
  const has = {
    Research: Boolean(data?.research),
    Solution: Boolean(data?.solution),
    Briefing: Boolean(data?.briefing),
    Email: Boolean(data?.email),
    Insight: Boolean(data?.insight?.insight_text),
  };

  // Block every generate/refine/edit action until the cache lookup finishes —
  // the first open can take ~30s (BigQuery cold start) and clicking Generate
  // before we know what already exists would needlessly re-run the pipeline.
  const actionsDisabled = busy !== null || loading;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: "100%", sm: "90%", md: "70%", lg: "65%" } },
      }}
    >
      {task && (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header */}
          <Box sx={{ px: 3, pt: 2, pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: avatarColor(title) }}>{initials(title)}</Avatar>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="h6" noWrap title={title}>
                  {title}
                </Typography>
                {task.id && (
                  <Typography variant="caption" color="text.secondary">
                    #{task.id}
                    {task.accountName && task.accountName !== title && (
                      <> · account: {task.accountName}</>
                    )}
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                variant="contained"
                startIcon={
                  actionsDisabled ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <AutoAwesomeIcon />
                  )
                }
                disabled={actionsDisabled}
                onClick={() => generate("all")}
              >
                {busy ?? (loading ? "Checking…" : "Generate all")}
              </Button>
              <IconButton onClick={onClose} aria-label="Close">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 1.5 }}
            >
              {color && (
                <Chip
                  label={COLUMN_LABELS[task.column]}
                  size="small"
                  sx={{ bgcolor: color.bg, color: color.text }}
                />
              )}
              {task.status && (
                <Chip label={task.status} size="small" variant="outlined" />
              )}
              <Box sx={{ flexGrow: 1 }} />
              {/* Pipeline strip */}
              <Stack direction="row" spacing={1.25} alignItems="center">
                {(["Research", "Solution", "Briefing", "Email", "Insight"] as const).map((k) => (
                  <Stack key={k} direction="row" spacing={0.5} alignItems="center">
                    <Box
                      sx={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        bgcolor: has[k] ? "success.main" : "transparent",
                        border: has[k] ? "none" : "1.5px solid",
                        borderColor: "text.disabled",
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: has[k] ? "success.main" : "text.disabled",
                        fontWeight: has[k] ? 600 : 400,
                      }}
                    >
                      {k}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Box>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
          >
            {TABS.map((t) => (
              <Tab key={t} label={t} sx={{ minWidth: 0 }} />
            ))}
          </Tabs>

          {/* Scrollable content */}
          <Box sx={{ px: 3, flexGrow: 1, overflowY: "auto" }}>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {loading && (
              <Alert
                severity="info"
                icon={<CircularProgress size={18} />}
                sx={{ mt: 2 }}
              >
                Checking BigQuery for saved materials for this company — this can
                take up to ~30s on first open. Please wait…
              </Alert>
            )}

            {/* Overview */}
            <TabPanel value={tab} index={0}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <Field label="FSR" value={task.fsr} />
                <Field label="Alias" value={task.alias} />
                <Field label="Meeting Location" value={task.meetingLocation} />
                <Field label="Specialization" value={task.specialization} />
                <Field label="CE Assigned" value={task.ceAssigned} />
                <Field label="CE Assigned-2 / Manager" value={task.ceAssigned2} />
                <Field label="Needs" value={task.needs} />
                <Field label="Created" value={task.created} />
                <Field label="Last Update" value={task.lastUpdate} />
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                FSR / CE Focal Comment
              </Typography>
              <Paper
                variant="outlined"
                sx={{ mt: 0.5, p: 1.5, borderRadius: 2, whiteSpace: "pre-wrap" }}
              >
                <Typography variant="body2">
                  {task.comment || "No comment yet."}
                </Typography>
              </Paper>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 2, display: "block" }}
              >
                CE Comments (work done)
              </Typography>
              <Paper
                variant="outlined"
                sx={{ mt: 0.5, p: 1.5, borderRadius: 2, whiteSpace: "pre-wrap" }}
              >
                <Typography variant="body2">
                  {task.ceComments || "No work logged yet."}
                </Typography>
              </Paper>
            </TabPanel>

            {/* Research */}
            <TabPanel value={tab} index={1}>
              <TabActions
                present={Boolean(data?.research?.research_text)}
                type="research"
                busyLabel={busy === "Generating research…" ? "Generating…" : null}
                disabled={actionsDisabled}
                onGenerate={generate}
                onEdit={() => startEdit("research")}
              />
              {editing === "research" ? (
                <>
                  <TextField
                    fullWidth
                    multiline
                    minRows={16}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    label="Company Research (Markdown)"
                  />
                  <EditActions saving={saving} onSave={saveEdit} onCancel={() => setEditing(null)} />
                </>
              ) : loading ? (
                <LoadingBlock />
              ) : data?.research?.research_text ? (
                <>
                  <ArtifactHeader
                    title="Company Research"
                    updatedAt={data.research.updated_at}
                    edited={data.research.edited_by_user}
                    copyText={data.research.research_text}
                  />
                  <Markdown>{data.research.research_text}</Markdown>
                  {data.research.deep_research_text && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <ArtifactHeader
                        title="Deep Research"
                        copyText={data.research.deep_research_text}
                      />
                      <Markdown>{data.research.deep_research_text}</Markdown>
                    </>
                  )}
                </>
              ) : (
                <EmptyState
                  message="We don't have any research saved for this company yet."
                  hint="Click Generate and we'll look it up and fill it in."
                />
              )}
            </TabPanel>

            {/* Solution */}
            <TabPanel value={tab} index={2}>
              <TabActions
                present={Boolean(data?.solution)}
                type="solution"
                busyLabel={busy === "Generating solution…" ? "Generating…" : null}
                disabled={actionsDisabled}
                onGenerate={generate}
                onEdit={() => startEdit("solution")}
              />
              {editing === "solution" ? (
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Problem Understanding"
                    value={draftProblem}
                    onChange={(e) => setDraftProblem(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={6}
                    label="Primary Solution (Markdown)"
                    value={draftPrimary}
                    onChange={(e) => setDraftPrimary(e.target.value)}
                  />
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                      Discovery Questions
                    </Typography>
                    <Stack spacing={1.5}>
                      {draftQuestions.map((q, i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Stack spacing={1} sx={{ flexGrow: 1 }}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Question"
                                value={q.question}
                                onChange={(e) =>
                                  setDraftQuestions((qs) =>
                                    qs.map((x, j) =>
                                      j === i ? { ...x, question: e.target.value } : x
                                    )
                                  )
                                }
                              />
                              <TextField
                                fullWidth
                                size="small"
                                label="Example answer"
                                value={q.example_answer ?? ""}
                                onChange={(e) =>
                                  setDraftQuestions((qs) =>
                                    qs.map((x, j) =>
                                      j === i ? { ...x, example_answer: e.target.value } : x
                                    )
                                  )
                                }
                              />
                            </Stack>
                            <IconButton
                              size="small"
                              aria-label="Remove question"
                              onClick={() =>
                                setDraftQuestions((qs) => qs.filter((_, j) => j !== i))
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Paper>
                      ))}
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() =>
                          setDraftQuestions((qs) => [...qs, { question: "", example_answer: "" }])
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Add question
                      </Button>
                    </Stack>
                  </Box>
                  <EditActions saving={saving} onSave={saveEdit} onCancel={() => setEditing(null)} />
                </Stack>
              ) : loading ? (
                <LoadingBlock />
              ) : data?.solution ? (
                <>
                  {data.solutionStale && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The focal comment changed since this solution was generated — it
                      may be out of date.
                    </Alert>
                  )}
                  {data.solution.problem_understanding && (
                    <>
                      <ArtifactHeader
                        title="Problem Understanding"
                        updatedAt={data.solution.updated_at}
                        edited={data.solution.edited_by_user}
                        copyText={data.solution.problem_understanding}
                      />
                      <Markdown>{data.solution.problem_understanding}</Markdown>
                    </>
                  )}
                  {data.solution.primary_solution && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <ArtifactHeader
                        title="Primary Solution"
                        copyText={data.solution.primary_solution}
                      />
                      <Markdown>{data.solution.primary_solution}</Markdown>
                    </>
                  )}
                  {data.solution.discovery_questions?.length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Discovery Questions
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                        Answer what the customer told you, add any extra context, then
                        Refine to tailor the solution (briefing &amp; email regenerate too).
                      </Typography>
                      <Stack spacing={1.5}>
                        {data.solution.discovery_questions.map((q, i) => (
                          <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {q.question}
                            </Typography>
                            {q.example_answer && (
                              <Typography variant="caption" color="text.secondary">
                                e.g. {q.example_answer}
                              </Typography>
                            )}
                            <TextField
                              fullWidth
                              size="small"
                              multiline
                              label="Customer answer"
                              value={draftAnswers[i] ?? ""}
                              disabled={actionsDisabled}
                              onChange={(e) =>
                                setDraftAnswers((a) => {
                                  const next = [...a];
                                  next[i] = e.target.value;
                                  return next;
                                })
                              }
                              sx={{ mt: 1 }}
                            />
                          </Paper>
                        ))}
                        <TextField
                          fullWidth
                          size="small"
                          multiline
                          minRows={2}
                          label="Comments / extra context"
                          value={draftComment}
                          disabled={actionsDisabled}
                          onChange={(e) => setDraftComment(e.target.value)}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={
                            busy !== null ? (
                              <CircularProgress size={14} color="inherit" />
                            ) : (
                              <AutoAwesomeIcon />
                            )
                          }
                          disabled={actionsDisabled}
                          onClick={refine}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {busy ?? "Refine solution"}
                        </Button>
                      </Stack>
                    </>
                  )}
                  {data.solution.refined_solution && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <ArtifactHeader
                        title={`Refined Solution${
                          data.solution.refined_count
                            ? ` (v${data.solution.refined_count})`
                            : ""
                        }`}
                        copyText={data.solution.refined_solution}
                      />
                      <Markdown>{data.solution.refined_solution}</Markdown>
                    </>
                  )}
                </>
              ) : (
                <EmptyState
                  message="No solution yet for this company."
                  hint="Click Generate to draft a problem statement, solution and discovery questions."
                />
              )}
            </TabPanel>

            {/* Briefing */}
            <TabPanel value={tab} index={3}>
              <TabActions
                present={Boolean(data?.briefing?.briefing_text)}
                type="briefing"
                busyLabel={busy === "Generating briefing…" ? "Generating…" : null}
                disabled={actionsDisabled}
                onGenerate={generate}
                onEdit={() => startEdit("briefing")}
              />
              {editing === "briefing" ? (
                <>
                  <TextField
                    fullWidth
                    multiline
                    minRows={20}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    label="Meeting Briefing (Markdown)"
                  />
                  <EditActions saving={saving} onSave={saveEdit} onCancel={() => setEditing(null)} />
                </>
              ) : loading ? (
                <LoadingBlock />
              ) : data?.briefing?.briefing_text ? (
                <>
                  {data.briefingStale && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The focal comment changed since this briefing was generated — it
                      may be out of date.
                    </Alert>
                  )}
                  <ArtifactHeader
                    title="Meeting Briefing"
                    updatedAt={data.briefing.updated_at}
                    edited={data.briefing.edited_by_user}
                    copyText={data.briefing.briefing_text}
                  />
                  <Markdown>{data.briefing.briefing_text}</Markdown>
                </>
              ) : (
                <EmptyState
                  message="No meeting briefing yet for this company."
                  hint="Click Generate to prepare one for your meeting."
                />
              )}
            </TabPanel>

            {/* Email */}
            <TabPanel value={tab} index={4}>
              <TabActions
                present={Boolean(data?.email?.followup_text || data?.email?.discovery_text)}
                type="email"
                busyLabel={busy === "Generating email…" ? "Generating…" : null}
                disabled={actionsDisabled}
                onGenerate={generate}
                onEdit={() => startEdit("email")}
              />
              {editing === "email" ? (
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    label="Follow-up subject"
                    value={draftFollowupSubject}
                    onChange={(e) => setDraftFollowupSubject(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={8}
                    label="Follow-up email (Markdown)"
                    value={draftFollowupText}
                    onChange={(e) => setDraftFollowupText(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Discovery subject"
                    value={draftDiscoverySubject}
                    onChange={(e) => setDraftDiscoverySubject(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={8}
                    label="Discovery email (Markdown)"
                    value={draftDiscoveryText}
                    onChange={(e) => setDraftDiscoveryText(e.target.value)}
                  />
                  <EditActions saving={saving} onSave={saveEdit} onCancel={() => setEditing(null)} />
                </Stack>
              ) : loading ? (
                <LoadingBlock />
              ) : data?.email && (data.email.followup_text || data.email.discovery_text) ? (
                <>
                  {data.emailStale && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The focal comment changed since these emails were generated — they
                      may be out of date.
                    </Alert>
                  )}
                  {data.email.followup_text && (
                    <>
                      <ArtifactHeader
                        title={`Follow-up — ${data.email.followup_subject ?? ""}`}
                        updatedAt={data.email.updated_at}
                        edited={data.email.edited_by_user}
                        copyText={`Subject: ${data.email.followup_subject ?? ""}\n\n${data.email.followup_text}`}
                      />
                      <Markdown>{data.email.followup_text}</Markdown>
                    </>
                  )}
                  {data.email.discovery_text && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <ArtifactHeader
                        title={`Discovery questions — ${data.email.discovery_subject ?? ""}`}
                        copyText={`Subject: ${data.email.discovery_subject ?? ""}\n\n${data.email.discovery_text}`}
                      />
                      <Markdown>{data.email.discovery_text}</Markdown>
                    </>
                  )}
                </>
              ) : (
                <EmptyState
                  message="No emails yet for this company."
                  hint="Click Generate to draft follow-up and discovery emails."
                />
              )}
            </TabPanel>

            {/* History: other tasks of this company + an account-level AI insight. */}
            <TabPanel value={tab} index={5}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Tasks for {title}
              </Typography>
              {historyTasks.length === 0 ? (
                <EmptyState message={`No other tasks for ${title} yet.`} />
              ) : (
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Status</TableCell>
                        <TableCell>CE</TableCell>
                        <TableCell>Focal comment</TableCell>
                        <TableCell>Work done</TableCell>
                        <TableCell>Updated</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {historyTasks.map((t) => {
                        const c = COLUMN_COLOR[t.column];
                        return (
                          <TableRow
                            key={t.uid}
                            hover
                            onClick={() => onOpenTask(t)}
                            sx={{ cursor: "pointer", verticalAlign: "top" }}
                          >
                            <TableCell>
                              <Chip
                                label={COLUMN_LABELS[t.column]}
                                size="small"
                                sx={{ bgcolor: c.bg, color: c.text, fontWeight: 600 }}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                              {t.ceAssigned || "—"}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              <Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {t.comment || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {t.ceComments || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                              {t.lastUpdate || t.created || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Paper>
              )}

              <Divider sx={{ my: 3 }} />

              {/* Account-level AI insight across all of the company's tasks. */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
                <Button
                  size="small"
                  variant={data?.insight?.insight_text ? "outlined" : "contained"}
                  startIcon={
                    busy === STAGE_LABELS.insight ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : data?.insight?.insight_text ? (
                      <RefreshIcon />
                    ) : (
                      <AutoAwesomeIcon />
                    )
                  }
                  disabled={actionsDisabled || companyTasks.length === 0}
                  onClick={generateInsight}
                >
                  {busy === STAGE_LABELS.insight
                    ? "Generating…"
                    : data?.insight?.insight_text
                      ? "Regenerate"
                      : "Generate insight"}
                </Button>
                {data?.insight?.insight_text && (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    disabled={actionsDisabled}
                    onClick={() => startEdit("insight")}
                  >
                    Edit
                  </Button>
                )}
              </Stack>

              {editing === "insight" ? (
                <>
                  <TextField
                    fullWidth
                    multiline
                    minRows={16}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    label="Account Insight (Markdown)"
                  />
                  <EditActions saving={saving} onSave={saveEdit} onCancel={() => setEditing(null)} />
                </>
              ) : busy === STAGE_LABELS.insight ? (
                <LoadingBlock />
              ) : data?.insight?.insight_text ? (
                <>
                  <ArtifactHeader
                    title="Account Insight"
                    updatedAt={data.insight.updated_at}
                    edited={data.insight.edited_by_user}
                    copyText={data.insight.insight_text}
                  />
                  <Markdown>{data.insight.insight_text}</Markdown>
                </>
              ) : (
                <EmptyState
                  message="No account insight yet."
                  hint="It generates automatically, or click Generate insight."
                />
              )}
            </TabPanel>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
