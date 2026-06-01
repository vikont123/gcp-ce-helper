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
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import EditNoteIcon from "@mui/icons-material/EditNote";
import Markdown, { EmptyState } from "@/components/Markdown";
import { COLUMN_LABELS, type Task } from "@/lib/tasks";
import { avatarColor, initials, COLUMN_COLOR } from "@/lib/ui";
import type { TaskArtifacts } from "@/lib/bigquery";

const TABS = [
  "Overview",
  "Research",
  "Solution",
  "Briefing",
  "Email",
  "History",
] as const;

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
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ mb: 1 }}
    >
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

export default function TaskDrawer({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState(0);
  const [data, setData] = React.useState<TaskArtifacts | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const open = Boolean(task);
  const title = task ? task.accountName || `Task ${task.id}` : "";
  const color = task ? COLUMN_COLOR[task.column] : null;

  // Load artifacts whenever a (different) task is opened.
  React.useEffect(() => {
    if (!task?.id) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/tasks/${encodeURIComponent(task.id)}/artifacts`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
        if (!cancelled) setData(body.artifacts as TaskArtifacts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task?.id]);

  // Reset to the first tab each time a new task opens.
  React.useEffect(() => {
    if (task?.id) setTab(0);
  }, [task?.id]);

  // Pipeline status dots: ✓ when the artifact exists.
  const has = {
    Research: Boolean(data?.research),
    Solution: Boolean(data?.solution),
    Briefing: Boolean(data?.briefing),
  };

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
              <Avatar sx={{ bgcolor: avatarColor(title) }}>
                {initials(title)}
              </Avatar>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="h6" noWrap title={title}>
                  {title}
                </Typography>
                {task.id && (
                  <Typography variant="caption" color="text.secondary">
                    #{task.id}
                  </Typography>
                )}
              </Box>
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
                {(["Research", "Solution", "Briefing"] as const).map((k) => (
                  <Stack
                    key={k}
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                  >
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
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
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
              {loading ? (
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
                <EmptyState message="No research yet for this company." />
              )}
            </TabPanel>

            {/* Solution */}
            <TabPanel value={tab} index={2}>
              {loading ? (
                <LoadingBlock />
              ) : data?.solution ? (
                <>
                  {data.solutionStale && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The focal comment changed since this solution was
                      generated — it may be out of date.
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
                      <Stack spacing={1}>
                        {data.solution.discovery_questions.map((q, i) => (
                          <Paper
                            key={i}
                            variant="outlined"
                            sx={{ p: 1.5, borderRadius: 2 }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {q.question}
                            </Typography>
                            {q.example_answer && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                e.g. {q.example_answer}
                              </Typography>
                            )}
                          </Paper>
                        ))}
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
                <EmptyState message="No solution generated yet." />
              )}
            </TabPanel>

            {/* Briefing */}
            <TabPanel value={tab} index={3}>
              {loading ? (
                <LoadingBlock />
              ) : data?.briefing?.briefing_text ? (
                <>
                  {data.briefingStale && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The focal comment changed since this briefing was
                      generated — it may be out of date.
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
                <EmptyState message="No briefing generated yet." />
              )}
            </TabPanel>

            {/* Email (later slice) */}
            <TabPanel value={tab} index={4}>
              <EmptyState message="Customer email — coming in a later step." />
            </TabPanel>

            {/* History (later slice) */}
            <TabPanel value={tab} index={5}>
              <EmptyState message="Account history — coming in a later step." />
            </TabPanel>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
