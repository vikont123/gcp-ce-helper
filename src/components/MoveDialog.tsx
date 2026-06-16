"use client";

import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  COLUMN_LABELS,
  STATUS_OPTIONS,
  type ColumnId,
  type Task,
} from "@/lib/tasks";

export interface MoveRequest {
  task: Task;
  column: ColumnId;
}

/** Local YYYY-MM-DD date stamp used to tag each CE Comment entry. */
function todayStamp(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Confirmation dialog shown when a card is dragged into In Work / Completed:
 * pick the exact status and log a mandatory CE Comment (work note). The note is
 * prefixed with the destination column + date — e.g. "(in work(2026-07-09)) …;"
 * — and appended to the existing history (we never overwrite prior notes).
 * Cancelling leaves the card where it was.
 */
export default function MoveDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: MoveRequest | null;
  onCancel: () => void;
  onConfirm: (status: string, ceComment: string) => void;
}) {
  const column = request?.column ?? "inwork";
  const options = STATUS_OPTIONS[column];

  const [status, setStatus] = React.useState(options[0]);
  const [comment, setComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  // Reset the form each time a new move is requested. The comment field holds a
  // NEW note only — prior history is shown read-only below, never edited here.
  React.useEffect(() => {
    if (request) {
      setStatus(STATUS_OPTIONS[request.column][0]);
      setComment("");
      setTouched(false);
    }
  }, [request]);

  const history = request?.task.ceComments?.trim() ?? "";
  const empty = comment.trim() === "";

  const handleConfirm = () => {
    if (empty) {
      setTouched(true);
      return;
    }
    // (<destination>(<date>)) <note>;  appended to the existing history.
    const entry = `(${COLUMN_LABELS[column].toLowerCase()}(${todayStamp()})) ${comment.trim()};`;
    const combined = history ? `${history} ${entry}` : entry;
    onConfirm(status, combined);
  };

  return (
    <Dialog
      open={Boolean(request)}
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 4 } }}
    >
      {request && (
        <>
          <DialogTitle>
            Move to {COLUMN_LABELS[column]}
            <Typography variant="body2" color="text.secondary" noWrap>
              {request.task.accountName || `Task ${request.task.id}`}
            </Typography>
          </DialogTitle>

          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                fullWidth
                size="small"
              >
                {options.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </TextField>

              {history && (
                <TextField
                  label="Previous notes"
                  value={history}
                  fullWidth
                  multiline
                  maxRows={4}
                  size="small"
                  InputProps={{ readOnly: true }}
                  sx={{ "& textarea": { color: "text.secondary" } }}
                />
              )}

              <TextField
                label="CE Comment (work done)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => setTouched(true)}
                required
                error={touched && empty}
                helperText={
                  touched && empty
                    ? "A comment is required to move this card."
                    : `Tagged as “(${COLUMN_LABELS[column].toLowerCase()}(${todayStamp()})) …;” and added to the history.`
                }
                fullWidth
                multiline
                minRows={3}
                placeholder="What was done / next steps…"
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onCancel} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" disabled={empty} onClick={handleConfirm}>
              Move
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
