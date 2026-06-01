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

/**
 * Confirmation dialog shown when a card is dragged into In Work / Completed:
 * pick the exact status and optionally log a CE Comment (work note). Cancelling
 * leaves the card where it was.
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

  // Reset the form each time a new move is requested.
  React.useEffect(() => {
    if (request) {
      setStatus(STATUS_OPTIONS[request.column][0]);
      setComment(request.task.ceComments ?? "");
    }
  }, [request]);

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

              <TextField
                label="CE Comment (work done)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
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
            <Button
              variant="contained"
              onClick={() => onConfirm(status, comment)}
            >
              Move
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
