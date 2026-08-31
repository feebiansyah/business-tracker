"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigationItems } from "./navigation";
export function Topbar() { const pathname = usePathname(); const currentPage = navigationItems.find((item) => item.href === pathname)?.label ?? "Business Tracker"; return <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8"><div><p className="text-xs font-medium text-slate-500">Business Tracker</p><h1 className="text-base font-semibold text-slate-950">{currentPage}</h1></div><Button variant="ghost" size="icon" aria-label="Profil pengguna"><UserRound className="size-5 text-slate-600" /></Button><nav className="fixed inset-x-0 bottom-0 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white p-2 lg:hidden" aria-label="Navigasi mobile">{navigationItems.map((item) => { const Icon = item.icon; const isActive = pathname === item.href; return <Link key={item.href} href={item.href} className={`flex min-w-18 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-500"}`}><Icon className="size-4" aria-hidden="true" />{item.label}</Link>; })}</nav></header>; }
