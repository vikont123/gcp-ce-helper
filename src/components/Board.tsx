"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import AppHeader from "@/components/AppHeader";
import Column from "@/components/Column";
import TaskCard from "@/components/TaskCard";
import TaskDetail from "@/components/TaskDetail";
import MoveDialog, { type MoveRequest } from "@/components/MoveDialog";
import {
  COLUMN_ORDER,
  statusForColumn,
  type ColumnId,
  type Task,
} from "@/lib/tasks";

interface TasksResponse {
  tasks?: Task[];
  ceName?: string;
  error?: string;
}

export default function Board() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [ceName, setCeName] = React.useState("Michael Gadaev");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Task | null>(null);
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const [moveRequest, setMoveRequest] = React.useState<MoveRequest | null>(null);
  const [snack, setSnack] = React.useState<string | null>(null);

  // A small drag threshold so a normal click still opens the task detail.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data: TasksResponse = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setTasks(data.tasks ?? []);
      if (data.ceName) setCeName(data.ceName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Optimistically move a task, then persist; revert and warn on failure.
  const moveTask = React.useCallback(
    async (
      task: Task,
      column: ColumnId,
      status: string,
      ceComment?: string
    ) => {
      const snapshot = tasks;
      setTasks((ts) =>
        ts.map((t) =>
          t.id === task.id
            ? {
                ...t,
                column,
                status,
                ceComments: ceComment !== undefined ? ceComment : t.ceComments,
              }
            : t
        )
      );

      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: task.id,
            column,
            status,
            ...(ceComment !== undefined ? { ceComment } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      } catch (err) {
        setTasks(snapshot); // revert the optimistic move
        setSnack(err instanceof Error ? err.message : String(err));
      }
    },
    [tasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask((event.active.data.current?.task as Task) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const over = event.over;
    const task = event.active.data.current?.task as Task | undefined;
    if (!over || !task) return;

    const target = over.id as ColumnId;
    if (!COLUMN_ORDER.includes(target) || target === task.column) return;

    if (target === "todo") {
      // Todo has a single status — move straight away, no dialog.
      moveTask(task, "todo", statusForColumn("todo"));
    } else {
      // In Work / Completed: let the user pick a status and log a comment.
      setMoveRequest({ task, column: target });
    }
  };

  // Client-side search across the most useful free-text fields.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      [
        t.accountName,
        t.fsr,
        t.meetingLocation,
        t.specialization,
        t.needs,
        t.comment,
        t.ceComments,
        t.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [tasks, query]);

  const byColumn = React.useMemo(() => {
    const map: Record<ColumnId, Task[]> = {
      todo: [],
      inwork: [],
      completed: [],
    };
    for (const t of filtered) map[t.column].push(t);
    return map;
  }, [filtered]);

  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <AppHeader
        ceName={ceName}
        query={query}
        onQueryChange={setQuery}
        onRefresh={load}
        refreshing={loading}
      />

      <Box sx={{ flex: 1, minHeight: 0, p: 2 }}>
        {error ? (
          <Alert
            severity="error"
            sx={{ maxWidth: 720, mx: "auto", mt: 4, borderRadius: 3 }}
            action={
              <Button color="inherit" size="small" onClick={load}>
                Retry
              </Button>
            }
          >
            <AlertTitle>Could not load tasks</AlertTitle>
            {error}
          </Alert>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Stack
              direction="row"
              spacing={2}
              sx={{
                height: "100%",
                overflowX: "auto",
                alignItems: "stretch",
              }}
            >
              {COLUMN_ORDER.map((columnId) => (
                <Column
                  key={columnId}
                  columnId={columnId}
                  tasks={byColumn[columnId]}
                  loading={loading}
                  onOpen={setSelected}
                />
              ))}
            </Stack>

            <DragOverlay>
              {activeTask ? (
                <Box sx={{ width: 340, transform: "rotate(2deg)", cursor: "grabbing" }}>
                  <TaskCard task={activeTask} onOpen={() => {}} />
                </Box>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </Box>

      <TaskDetail task={selected} onClose={() => setSelected(null)} />

      <MoveDialog
        request={moveRequest}
        onCancel={() => setMoveRequest(null)}
        onConfirm={(status, ceComment) => {
          const req = moveRequest;
          setMoveRequest(null);
          if (req) moveTask(req.task, req.column, status, ceComment);
        }}
      />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setSnack(null)}
          sx={{ borderRadius: 2 }}
        >
          {snack}
        </Alert>
      </Snackbar>
    </Box>
  );
}
