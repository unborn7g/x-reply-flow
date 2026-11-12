import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X ReplyFlow — $0 X Comment & Reply Bot Studio",
  description:
    "Paste X links, source post context for free, write or generate natural comments, and launch pre-filled replies straight to your logged-in X account.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
