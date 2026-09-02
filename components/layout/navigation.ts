import {
  BarChart3, ChartNoAxesCombined, Layers3, LayoutDashboard, Megaphone,
  Settings, ShoppingBag, Waypoints, type LucideIcon,
} from "lucide-react";
import type { ShopeeWorkflowSlug } from "./navigation-state";

export type NavigationItem = { href: string; label: string; icon: LucideIcon };

export const navigationItems: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wl", label: "Semua WL", icon: Layers3 },
  { href: "/meta", label: "Meta", icon: Megaphone },
  { href: "/adu", label: "ADU", icon: Waypoints },
  { href: "/terra", label: "Terra", icon: BarChart3 },
  { href: "/roi-tracker", label: "ROI Tracker", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const shopeeNavigation = { href: "/shopee", label: "Akun Shopee", icon: ShoppingBag };

export const shopeeWorkflows: { href: ShopeeWorkflowSlug; label: string }[] = [
  { href: "import", label: "Import Shopee" },
  { href: "filter", label: "Filter" },
  { href: "fix", label: "Fix" },
  { href: "off-filter", label: "OFF Filter" },
  { href: "off-fix", label: "OFF Fix" },
];
