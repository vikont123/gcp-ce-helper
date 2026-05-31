"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import TaskCard from "@/components/TaskCard";
import { COLUMN_LABELS, type ColumnId, type Task } from "@/lib/tasks";
import { COLUMN_COLOR } from "@/lib/ui";

export default function Column({
  columnId,
  tasks,
  loading,
  onOpen,
}: {
  columnId: ColumnId;
  tasks: Task[];
  loading: boolean;
  onOpen: (task: Task) => void;
}) {
  const color = COLUMN_COLOR[columnId];

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 300,
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        borderRadius: 3,
        height: "100%",
      }}
    >
      {/* Column header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1, py: 1.5 }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: color.text,
          }}
        />
        <Typography variant="subtitle1">{COLUMN_LABELS[columnId]}</Typography>
        <Box
          sx={{
            ml: 0.5,
            px: 1,
            py: 0.1,
            borderRadius: 5,
            bgcolor: color.bg,
            color: color.text,
            fontSize: 12,
            fontWeight: 600,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {loading ? "…" : tasks.length}
        </Box>
      </Stack>

      {/* Scrollable card list */}
      <Stack
        spacing={1.25}
        sx={{
          px: 1,
          pb: 2,
          overflowY: "auto",
          flex: 1,
        }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={132}
                sx={{ borderRadius: 3 }}
              />
            ))
          : tasks.map((task) => (
              <TaskCard
                key={task.id || task.accountName}
                task={task}
                onOpen={onOpen}
              />
            ))}

        {!loading && tasks.length === 0 && (
          <Box
            sx={{
              py: 4,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">No tasks</Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
