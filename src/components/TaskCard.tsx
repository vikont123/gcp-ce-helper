"use client";

import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import type { Task } from "@/lib/tasks";
import { avatarColor, initials, COLUMN_COLOR } from "@/lib/ui";

// Clamp text to N lines with an ellipsis (keeps cards readable but bounded).
const clamp = (lines: number) =>
  ({
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  }) as const;

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Box sx={{ color: "text.secondary", display: "flex", fontSize: 16 }}>
        {icon}
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        noWrap
        title={text}
        sx={{ minWidth: 0 }}
      >
        {text}
      </Typography>
    </Stack>
  );
}

export default function TaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (task: Task) => void;
}) {
  const title = task.accountName || `Task ${task.id}`;
  const color = COLUMN_COLOR[task.column];
  const needs = task.needs && task.needs.toLowerCase() !== "none" ? task.needs : "";
  // Prefer the CE's "work done" note (filled on completion); fall back to the
  // FSR/CE focal comment that frames the request.
  const snippet = task.ceComments || task.comment;
  const snippetLabel = task.ceComments ? "Work done" : "Context";

  return (
    // flexShrink: 0 stops the column's flexbox from squashing cards (which,
    // combined with Card's overflow:hidden, was clipping them in half).
    <Card sx={{ borderRadius: 3, flexShrink: 0 }}>
      <CardActionArea onClick={() => onOpen(task)} sx={{ p: 1.75 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar
            sx={{
              bgcolor: avatarColor(title),
              width: 36,
              height: 36,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {initials(title)}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="subtitle1"
              title={title}
              sx={{ lineHeight: 1.3, ...clamp(2) }}
            >
              {title}
            </Typography>
            {task.specialization && (
              <Typography variant="caption" color="text.secondary">
                {task.specialization}
              </Typography>
            )}
          </Box>
        </Stack>

        {(task.fsr || task.meetingLocation) && (
          <Stack spacing={0.5} sx={{ mt: 1.25 }}>
            {task.fsr && (
              <MetaRow
                icon={<PersonOutlineIcon fontSize="inherit" />}
                text={task.fsr}
              />
            )}
            {task.meetingLocation && (
              <MetaRow
                icon={<PlaceOutlinedIcon fontSize="inherit" />}
                text={task.meetingLocation}
              />
            )}
          </Stack>
        )}

        {snippet && (
          <Box sx={{ mt: 1.25 }}>
            <Typography
              variant="caption"
              sx={{
                color: color.text,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                fontSize: 10,
              }}
            >
              {snippetLabel}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.45, ...clamp(2) }}
            >
              {snippet}
            </Typography>
          </Box>
        )}

        {needs && (
          <Box sx={{ mt: 1.25 }}>
            <Chip
              label={needs}
              size="small"
              sx={{
                maxWidth: "100%",
                bgcolor: color.bg,
                color: color.text,
                fontWeight: 600,
              }}
            />
          </Box>
        )}
      </CardActionArea>
    </Card>
  );
}
