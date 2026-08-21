import type { Metadata } from "next";
import { BusinessDataRecordsPanel } from "@/components/dashboard/business-data/records-panel";

export const metadata: Metadata = {
  title: "رکوردهای مجموعه — پشتیبان",
};

const RecordsPage = async ({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) => {
  const { collectionId } = await params;
  return <BusinessDataRecordsPanel collectionId={collectionId} />;
};

export default RecordsPage;

