"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import AppHeader from "@/components/AppHeader";
import Column from "@/components/Column";
import TaskDetail from "@/components/TaskDetail";
import {
  COLUMN_ORDER,
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
        )}
      </Box>

      <TaskDetail task={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
