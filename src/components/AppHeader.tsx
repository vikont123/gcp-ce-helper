"use client";

import * as React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import LogoutIcon from "@mui/icons-material/Logout";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";
import { useSession, signOut } from "next-auth/react";

export default function AppHeader({
  ces,
  ce,
  onCeChange,
  query,
  onQueryChange,
  onRefresh,
  refreshing,
}: {
  ces: string[];
  ce: string;
  onCeChange: (ce: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

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

        {/* CE filter — switch which CE's board is shown */}
        <FormControl
          size="small"
          sx={{ minWidth: 180, display: { xs: "none", sm: "flex" } }}
        >
          <InputLabel id="ce-filter-label">CE</InputLabel>
          <Select
            labelId="ce-filter-label"
            label="CE"
            value={ce}
            onChange={(e) => onCeChange(e.target.value)}
          >
            <MenuItem value="">
              <em>All CEs</em>
            </MenuItem>
            {ces.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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

        {/* Signed-in user: avatar opens a menu with Sign out */}
        <Tooltip title={user?.email ?? "Account"}>
          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ p: 0.5 }}
            aria-label="account menu"
          >
            <Avatar
              src={user?.image ?? undefined}
              sx={{ width: 32, height: 32, bgcolor: "primary.main" }}
            >
              {(user?.name ?? "?")[0]}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          {user && (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user.email}
              </Typography>
            </Box>
          )}
          {user && <Divider />}
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              signOut({ callbackUrl: "/login" });
            }}
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
