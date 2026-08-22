import type { Metadata } from "next";
import { BusinessDataStructurePanel } from "@/components/dashboard/business-data/structure-panel";

export const metadata: Metadata = {
  title: "ساختار و دسترسی مجموعه — پشتیبان",
};

const StructurePage = async ({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) => {
  const { collectionId } = await params;
  return <BusinessDataStructurePanel collectionId={collectionId} />;
};

export default StructurePage;

