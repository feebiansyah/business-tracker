import { ShopeeWorkflowPlaceholder } from "@/components/shopee/workflow-placeholder";

export const dynamic = "force-dynamic";

export default async function FilterPage({ params }: { params: Promise<{ id: string }> }) {
  return <ShopeeWorkflowPlaceholder params={params} workflow="Filter" />;
}
