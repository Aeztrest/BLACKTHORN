import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackthorn TestLab",
  description: "Blackthorn icin aktif test laboratuvari",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
