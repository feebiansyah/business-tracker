import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { headers } from "next/headers";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Business Tracker", description: "Internal business performance tracker." };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const pathname = (await headers()).get("x-bt-pathname");
  return <html lang="id" className={inter.variable}><body>{pathname === "/login" ? children : <AppShell>{children}</AppShell>}</body></html>;
}
