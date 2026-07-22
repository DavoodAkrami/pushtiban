import { redirect } from "next/navigation";

const LegacyFlowPage = ({ params }: { params: { flowId: string } }) =>
  redirect(`/dashboard/flow/${params.flowId}`);

export default LegacyFlowPage;
