import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draw and Guess",
  description: "A small multiplayer drawing and guessing game."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
