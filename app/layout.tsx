import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = { title: "Business Tracker", description: "Internal business performance tracker." };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id"><body><AppShell>{children}</AppShell></body></html>;
}
