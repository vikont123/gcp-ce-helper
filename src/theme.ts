"use client";

import { createTheme } from "@mui/material/styles";
import { Roboto } from "next/font/google";

export const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Google Material Design 3 flavored theme — palette and shape tuned to feel like
// a first-party Google product (Cloud Console / Tasks / Keep).
const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#1a73e8" }, // Google blue
    secondary: { main: "#5f6368" }, // Google grey
    success: { main: "#1e8e3e" }, // Completed
    warning: { main: "#f9ab00" }, // In Work
    background: {
      default: "#f8f9fa", // Google neutral surface
      paper: "#ffffff",
    },
    text: {
      primary: "#202124",
      secondary: "#5f6368",
    },
    divider: "#e8eaed",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: roboto.style.fontFamily,
    h6: { fontWeight: 500 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: {
        root: { borderBottom: "1px solid #e8eaed", backgroundColor: "#ffffff" },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          borderColor: "#e8eaed",
          transition: "box-shadow 120ms ease, transform 120ms ease",
          "&:hover": {
            boxShadow:
              "0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
});

export default theme;
