import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tanthavi | Empowering India's Handloom Weavers",
  description: "Bridging the gap between rural artisans and global consumers through a transparent, verified, AI-powered marketplace.",
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
