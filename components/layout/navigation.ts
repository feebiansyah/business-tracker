import { BarChart3, ChartNoAxesCombined, Layers3, LayoutDashboard, Megaphone, Settings, ShoppingBag, Waypoints, type LucideIcon } from "lucide-react";
export type NavigationItem = { href: string; label: string; icon: LucideIcon };
export const navigationItems: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard }, { href: "/wl", label: "Semua WL", icon: Layers3 }, { href: "/meta", label: "Meta", icon: Megaphone }, { href: "/shopee", label: "Akun Shopee", icon: ShoppingBag }, { href: "/adu", label: "ADU", icon: Waypoints }, { href: "/terra", label: "Terra", icon: BarChart3 }, { href: "/roi-tracker", label: "ROI Tracker", icon: ChartNoAxesCombined }, { href: "/settings", label: "Settings", icon: Settings },
];
