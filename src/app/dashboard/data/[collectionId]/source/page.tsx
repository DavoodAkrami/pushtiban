import type { Metadata } from "next";
import { BusinessDataSourcePanel } from "@/components/dashboard/business-data/source-panel";

export const metadata: Metadata = {
  title: "منبع داده مجموعه — پشتیبان",
};

const SourcePage = async ({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) => {
  const { collectionId } = await params;
  return <BusinessDataSourcePanel collectionId={collectionId} />;
};

export default SourcePage;

