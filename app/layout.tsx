import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdGuard AI",
  description: "Платформа за откриване на течове в рекламни кампании"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg" className="dark">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
