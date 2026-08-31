import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Space Tennis",
  description: "A Tennis Court on a Distant Moon",
  icons: {
    icon: "/image/favicon/3d.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
