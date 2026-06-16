"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import TaskCard from "@/components/TaskCard";
import { COLUMN_LABELS, type ColumnId, type Task } from "@/lib/tasks";
import { COLUMN_COLOR } from "@/lib/ui";

// Wraps a card so it can be picked up. Tasks without an id can't be persisted,
// so they stay non-draggable.
function DraggableTaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.uid,
    data: { task },
    disabled: !task.id,
  });

  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      sx={{
        // Pointer sensor needs this so touch-drag doesn't scroll the column.
        touchAction: "none",
        cursor: task.id ? "grab" : "default",
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </Box>
  );
}

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
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 300,
        maxWidth: 520,
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

      {/* Scrollable, droppable card list */}
      <Stack
        ref={setNodeRef}
        spacing={1.25}
        sx={{
          px: 1,
          pb: 2,
          overflowY: "auto",
          flex: 1,
          borderRadius: 3,
          outline: isOver ? `2px dashed ${color.text}` : "2px dashed transparent",
          outlineOffset: -2,
          bgcolor: isOver ? color.bg : "transparent",
          transition: "background-color 120ms ease, outline-color 120ms ease",
        }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={132}
                sx={{ borderRadius: 3, flexShrink: 0 }}
              />
            ))
          : tasks.map((task) => (
              <DraggableTaskCard
                key={task.uid}
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
              // Keep an empty column tall enough to be an easy drop target.
              flex: 1,
              minHeight: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2">
              {isOver ? "Drop here" : "No tasks"}
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
