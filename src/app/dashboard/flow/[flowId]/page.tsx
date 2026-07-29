import type { Metadata } from "next";
import { FlowDetailPage } from "@/components/dashboard/flow-detail-page";

export const metadata: Metadata = {
  title: "ویرایش فلو — پشتیبان",
  description: "طراحی دیداری پیام‌ها، دکمه‌ها و مسیرهای یک فلو.",
};

const FlowPage = async ({ params }: { params: Promise<{ flowId: string }> }) => {
  const { flowId } = await params;
  return <FlowDetailPage flowId={flowId} />;
};

export default FlowPage;
