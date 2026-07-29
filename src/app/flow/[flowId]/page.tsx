import { redirect } from "next/navigation";

const LegacyFlowPage = async ({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) => {
  const { flowId } = await params;
  redirect(`/dashboard/flow/${flowId}`);
};

export default LegacyFlowPage;
