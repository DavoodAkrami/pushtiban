import type { Metadata } from "next";
import { FlowDetailPage } from "@/components/dashboard/flow-detail-page";

export const metadata: Metadata = {
  title: "ویرایش فلو — پشتیبان",
  description: "طراحی دیداری پیام‌ها، دکمه‌ها و مسیرهای یک فلو.",
};

const FlowPage = ({ params }: { params: { flowId: string } }) => (
  <FlowDetailPage flowId={params.flowId} />
);

export default FlowPage;
