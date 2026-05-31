"use client";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import { COLUMN_LABELS, type Task } from "@/lib/tasks";
import { avatarColor, initials, COLUMN_COLOR } from "@/lib/ui";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.primary" }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

// A labelled, scroll-safe block for the longer free-text comment fields.
function CommentBlock({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty: string;
}) {
  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          mt: 0.5,
          p: 1.5,
          borderRadius: 2,
          bgcolor: "background.default",
          whiteSpace: "pre-wrap",
        }}
      >
        <Typography variant="body2">{value || empty}</Typography>
      </Paper>
    </>
  );
}

export default function TaskDetail({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const open = Boolean(task);
  const title = task ? task.accountName || `Task ${task.id}` : "";
  const color = task ? COLUMN_COLOR[task.column] : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 4 } }}
    >
      {task && (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: avatarColor(title) }}>
                {initials(title)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" noWrap title={title}>
                  {title}
                </Typography>
                {task.id && (
                  <Typography variant="caption" color="text.secondary">
                    #{task.id}
                  </Typography>
                )}
              </Box>
            </Stack>
            <IconButton
              onClick={onClose}
              sx={{ position: "absolute", right: 12, top: 12 }}
              aria-label="Close"
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
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
            </Stack>

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

            <CommentBlock
              label="FSR / CE Focal Comment"
              value={task.comment}
              empty="No comment yet."
            />

            <Box sx={{ mt: 2 }}>
              <CommentBlock
                label="CE Comments (work done)"
                value={task.ceComments}
                empty="No work logged yet."
              />
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}
