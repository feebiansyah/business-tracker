import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Business Tracker", description: "Internal business performance tracker." };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className={inter.variable}><body><AppShell>{children}</AppShell></body></html>;
}
