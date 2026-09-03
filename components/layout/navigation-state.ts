export type ShopeeWorkflowSlug = "import" | "filter" | "fix" | "off-filter" | "off-fix";
export type ShopeeNavigationKey = "overview" | ShopeeWorkflowSlug;

const workflowSlugs = new Set<ShopeeWorkflowSlug>(["import", "filter", "fix", "off-filter", "off-fix"]);

export type SidebarExpansionState = { shopeeExpanded: boolean; expandedAccountId: number | null };
export type SidebarExpansionAction = { type: "TOGGLE_SHOPEE" } | { type: "TOGGLE_ACCOUNT"; accountId: number };

export function createSidebarExpansionState(pathname: string): SidebarExpansionState {
  const [root, pathAccountId] = pathname.split("/").filter(Boolean);
  const parsedAccountId = Number(pathAccountId);
  return {
    shopeeExpanded: root === "shopee",
    expandedAccountId: root === "shopee" && Number.isSafeInteger(parsedAccountId) && parsedAccountId > 0 ? parsedAccountId : null,
  };
}

export function reduceSidebarExpansion(state: SidebarExpansionState, action: SidebarExpansionAction): SidebarExpansionState {
  if (action.type === "TOGGLE_SHOPEE") return { ...state, shopeeExpanded: !state.shopeeExpanded };
  return { shopeeExpanded: true, expandedAccountId: state.expandedAccountId === action.accountId ? null : action.accountId };
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
