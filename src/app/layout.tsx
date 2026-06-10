import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Impasto",
  description: "A local-first taste log for music, images, and changing opinions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
