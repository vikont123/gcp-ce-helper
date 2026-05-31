"use client";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";

export default function AppHeader({
  ceName,
  query,
  onQueryChange,
  onRefresh,
  refreshing,
}: {
  ceName: string;
  query: string;
  onQueryChange: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 2 }}>
        {/* Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ViewKanbanOutlinedIcon sx={{ color: "primary.main" }} />
          <Typography variant="h6" sx={{ color: "text.primary" }}>
            CE-tasker
          </Typography>
        </Box>

        {/* Search */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 0.5,
            borderRadius: 6,
            bgcolor: "background.default",
            flex: 1,
            maxWidth: 560,
            mx: { xs: 0, sm: 2 },
          }}
        >
          <SearchIcon sx={{ color: "text.secondary" }} fontSize="small" />
          <InputBase
            placeholder="Search account, FSR, location…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            sx={{ flex: 1, fontSize: 14 }}
            inputProps={{ "aria-label": "search tasks" }}
          />
        </Box>

        <Box sx={{ flexGrow: 1, display: { xs: "none", md: "block" } }} />

        {/* Active CE filter */}
        <Tooltip title="Active CE filter">
          <Chip
            label={ceName}
            size="small"
            sx={{ display: { xs: "none", sm: "flex" } }}
          />
        </Tooltip>

        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={onRefresh} disabled={refreshing}>
              <RefreshIcon
                sx={{
                  animation: refreshing ? "spin 0.8s linear infinite" : "none",
                  "@keyframes spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(360deg)" },
                  },
                }}
              />
            </IconButton>
          </span>
        </Tooltip>

        <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
          {ceName ? ceName[0] : "?"}
        </Avatar>
      </Toolbar>
    </AppBar>
  );
}
