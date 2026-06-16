import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import ThemeRegistry from "@/components/ThemeRegistry";
import { roboto } from "@/theme";

export const metadata: Metadata = {
  title: "CE-tasker",
  description: "AI Tech-CRM Kanban for Google Cloud Customer Engineers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={roboto.className}>
      <head>
        {/* Material Symbols for Google-style iconography */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body>
        <SessionProvider>
          <ThemeRegistry>{children}</ThemeRegistry>
        </SessionProvider>
      </body>
    </html>
  );
}
