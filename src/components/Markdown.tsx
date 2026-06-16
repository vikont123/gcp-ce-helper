"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

/**
 * Renders agent output (markdown) with Material-friendly styling. Links open in
 * a new tab. Used across the Research / Solution / Briefing tabs.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <Box
      sx={{
        "& h1": { typography: "h6", mt: 2, mb: 1 },
        "& h2": { typography: "subtitle1", fontWeight: 600, mt: 2, mb: 0.5 },
        "& h3": { typography: "subtitle2", fontWeight: 600, mt: 1.5, mb: 0.5 },
        "& p": { typography: "body2", my: 1, lineHeight: 1.6 },
        "& li": { typography: "body2", lineHeight: 1.6 },
        "& ul, & ol": { pl: 3, my: 1 },
        "& code": {
          fontFamily: "monospace",
          fontSize: "0.85em",
          bgcolor: "action.hover",
          px: 0.5,
          borderRadius: 0.5,
        },
        "& pre": {
          bgcolor: "action.hover",
          p: 1.5,
          borderRadius: 2,
          overflowX: "auto",
        },
        "& pre code": { bgcolor: "transparent", p: 0 },
        "& table": { borderCollapse: "collapse", my: 1, width: "100%" },
        "& th, & td": {
          border: "1px solid",
          borderColor: "divider",
          px: 1,
          py: 0.5,
          typography: "body2",
          textAlign: "left",
        },
        "& blockquote": {
          borderLeft: "3px solid",
          borderColor: "divider",
          pl: 1.5,
          ml: 0,
          color: "text.secondary",
        },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <Link href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </Link>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </Box>
  );
}

/** Centered placeholder for empty / not-yet-generated tabs. */
export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <AutoAwesomeIcon sx={{ color: "text.disabled", fontSize: 40, mb: 1 }} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}
