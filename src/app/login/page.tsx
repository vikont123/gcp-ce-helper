import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ViewKanbanOutlinedIcon from "@mui/icons-material/ViewKanbanOutlined";
import { auth } from "@/auth";
import LoginButton from "@/components/LoginButton";

export default async function LoginPage() {
  // Already signed in → straight to the board.
  const session = await auth();
  if (session) redirect("/");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Stack
        spacing={3}
        alignItems="center"
        sx={{
          p: 5,
          borderRadius: 4,
          bgcolor: "background.paper",
          boxShadow: 3,
          maxWidth: 380,
          width: "100%",
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <ViewKanbanOutlinedIcon sx={{ color: "primary.main", fontSize: 32 }} />
          <Typography variant="h5">CE-tasker</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          AI Tech-CRM Kanban for Google Cloud Customer Engineers
        </Typography>
        <LoginButton />
        <Typography variant="caption" color="text.secondary">
          Only @google.com accounts can sign in.
        </Typography>
      </Stack>
    </Box>
  );
}
