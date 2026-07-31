import { AssistantTabs } from "./assistant-tabs";

const AssistantLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-3xl">
    <AssistantTabs />
    {children}
  </div>
);

export default AssistantLayout;
