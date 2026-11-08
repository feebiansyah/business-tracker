export type ShopeeWorkflowSlug = "import" | "filter" | "fix" | "off-filter" | "off-fix" | "clickadu-roi" | "adsterra-roi";
export type ShopeeNavigationKey = "overview" | ShopeeWorkflowSlug;
export type ShopeeWorkflowGroupKey = "meta-ads" | "traffic";

const workflowSlugs = new Set<ShopeeWorkflowSlug>(["import", "filter", "fix", "off-filter", "off-fix", "clickadu-roi", "adsterra-roi"]);

export type SidebarExpansionState = {
  shopeeExpanded: boolean;
  expandedAccountId: number | null;
  expandedSubgroups: ShopeeWorkflowGroupKey[];
};
export type SidebarExpansionAction =
  | { type: "TOGGLE_SHOPEE" }
  | { type: "TOGGLE_ACCOUNT"; accountId: number }
  | { type: "TOGGLE_SUBGROUP"; subgroup: ShopeeWorkflowGroupKey };

export function createSidebarExpansionState(pathname: string): SidebarExpansionState {
  const [root, pathAccountId, workflow] = pathname.split("/").filter(Boolean);
  const parsedAccountId = Number(pathAccountId);
  return {
    shopeeExpanded: root === "shopee",
    expandedAccountId: root === "shopee" && Number.isSafeInteger(parsedAccountId) && parsedAccountId > 0 ? parsedAccountId : null,
    expandedSubgroups: getWorkflowGroup(workflow),
  };
}

export function reduceSidebarExpansion(state: SidebarExpansionState, action: SidebarExpansionAction): SidebarExpansionState {
  if (action.type === "TOGGLE_SHOPEE") return { ...state, shopeeExpanded: !state.shopeeExpanded };
  if (action.type === "TOGGLE_ACCOUNT") {
    return {
      shopeeExpanded: true,
      expandedAccountId: state.expandedAccountId === action.accountId ? null : action.accountId,
      expandedSubgroups: [],
    };
  }
  return {
    ...state,
    expandedSubgroups: state.expandedSubgroups.includes(action.subgroup)
      ? state.expandedSubgroups.filter((subgroup) => subgroup !== action.subgroup)
      : [...state.expandedSubgroups, action.subgroup],
  };
}

function getWorkflowGroup(workflow: string | undefined): ShopeeWorkflowGroupKey[] {
  if (["filter", "fix", "off-filter", "off-fix"].includes(workflow ?? "")) return ["meta-ads"];
  if (["clickadu-roi", "adsterra-roi"].includes(workflow ?? "")) return ["traffic"];
  return [];
}

export function getShopeeNavigationState(pathname: string, accountId: number) {
  const [root, pathAccountId, workflow] = pathname.split("/").filter(Boolean);
  const shopeeActive = root === "shopee";
  const accountActive = shopeeActive && pathAccountId === String(accountId);

  return {
    shopeeActive,
    accountActive,
    activeWorkflow: accountActive
      ? workflowSlugs.has(workflow as ShopeeWorkflowSlug)
        ? workflow as ShopeeWorkflowSlug
        : workflow === undefined
          ? "overview"
          : null
      : null,
  };
}
