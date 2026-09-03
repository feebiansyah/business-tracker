export type ShopeeWorkflowSlug = "import" | "filter" | "fix" | "off-filter" | "off-fix";
export type ShopeeNavigationKey = "overview" | ShopeeWorkflowSlug;

const workflowSlugs = new Set<ShopeeWorkflowSlug>(["import", "filter", "fix", "off-filter", "off-fix"]);

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
