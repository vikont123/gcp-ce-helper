import type { ColumnId } from "@/lib/tasks";

// Shared UI helpers: Google-flavored colors per column/status and avatar tinting.

export const COLUMN_COLOR: Record<
  ColumnId,
  { chip: string; bg: string; text: string }
> = {
  todo: { chip: "#e8f0fe", bg: "#e8f0fe", text: "#1967d2" },
  inwork: { chip: "#fef7e0", bg: "#fef7e0", text: "#b06000" },
  completed: { chip: "#e6f4ea", bg: "#e6f4ea", text: "#1e8e3e" },
};

// A small, stable palette to tint account avatars by name (like Google contacts).
const AVATAR_COLORS = [
  "#1a73e8",
  "#d93025",
  "#1e8e3e",
  "#e37400",
  "#9334e6",
  "#12a4af",
  "#c5221f",
  "#188038",
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
