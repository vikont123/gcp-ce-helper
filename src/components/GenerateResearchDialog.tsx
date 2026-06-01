"use client";

import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import LinearProgress from "@mui/material/LinearProgress";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

type Status = "pending" | "start" | "done" | "error";

function StatusIcon({ status }: { status: Status }) {
  if (status === "done")
    return <CheckCircleIcon color="success" fontSize="small" />;
  if (status === "error") return <ErrorIcon color="error" fontSize="small" />;
  if (status === "start") return <CircularProgress size={16} />;
  return (
    <RadioButtonUncheckedIcon
      sx={{ color: "text.disabled" }}
      fontSize="small"
    />
  );
}

/**
 * Header action that runs the batch research pipeline for all of the active CE's
 * companies, showing live per-company progress over SSE. Calls `onComplete` once
 * the run finishes so the board can refresh.
 */
export default function GenerateResearchDialog({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);
  // Ordered company list + a status/error map.
  const [order, setOrder] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<Record<string, Status>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const esRef = React.useRef<EventSource | null>(null);

  const cleanup = React.useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  const start = () => {
    setRunning(true);
    setFinished(false);
    setFatal(null);
    setOrder([]);
    setStatuses({});
    setErrors({});

    const es = new EventSource("/api/research/batch");
    esRef.current = es;

    es.addEventListener("init", (e) => {
      const { companies } = JSON.parse((e as MessageEvent).data) as {
        companies: string[];
      };
      setOrder(companies);
      setStatuses(
        Object.fromEntries(companies.map((c) => [c, "pending" as Status]))
      );
    });

    es.addEventListener("company", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        company: string;
        status: Status;
        error?: string;
      };
      setStatuses((s) => ({ ...s, [d.company]: d.status }));
      if (d.error) setErrors((x) => ({ ...x, [d.company]: d.error! }));
    });

    es.addEventListener("done", () => {
      setRunning(false);
      setFinished(true);
      cleanup();
      onComplete?.();
    });

    es.addEventListener("fatal", (e) => {
      const { error } = JSON.parse((e as MessageEvent).data) as { error: string };
      setFatal(error);
      setRunning(false);
      cleanup();
    });

    es.onerror = () => {
      // Stream dropped before a clean `done` — surface it and stop.
      if (esRef.current) {
        setFatal("Connection to the research stream was lost.");
        setRunning(false);
        cleanup();
      }
    };
  };

  const handleClose = () => {
    if (running) return; // don't close mid-run
    setOpen(false);
  };

  const total = order.length;
  const doneCount = order.filter(
    (c) => statuses[c] === "done" || statuses[c] === "error"
  ).length;

  return (
    <>
      <Tooltip title="Generate company research (all)">
        <IconButton onClick={() => setOpen(true)} aria-label="Generate research">
          <AutoAwesomeIcon />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>
          Generate company research
          <Typography variant="body2" color="text.secondary">
            Runs grounded research (Gemini → Claude) for every company and saves
            it. Existing rows are refreshed; ones you edited are kept.
          </Typography>
        </DialogTitle>

        <DialogContent>
          {fatal && (
            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
              {fatal}
            </Typography>
          )}

          {!running && !finished && order.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Click “Generate” to start. This can take a few minutes.
            </Typography>
          )}

          {total > 0 && (
            <Box sx={{ mb: 1 }}>
              <LinearProgress
                variant="determinate"
                value={(doneCount / total) * 100}
              />
              <Typography variant="caption" color="text.secondary">
                {doneCount} / {total} companies
              </Typography>
            </Box>
          )}

          <List dense sx={{ maxHeight: 360, overflowY: "auto" }}>
            {order.map((company) => (
              <ListItem key={company} disableGutters>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <StatusIcon status={statuses[company] ?? "pending"} />
                </ListItemIcon>
                <ListItemText
                  primary={company}
                  secondary={errors[company]}
                  secondaryTypographyProps={{ color: "error" }}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={running}>
            {finished ? "Close" : "Cancel"}
          </Button>
          <Button variant="contained" onClick={start} disabled={running}>
            {running ? "Generating…" : finished ? "Run again" : "Generate"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
