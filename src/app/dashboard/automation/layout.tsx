import { AutomationTabs } from "./automation-tabs";

const AutomationLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-5xl">
    <AutomationTabs />
    {children}
  </div>
);

export default AutomationLayout;
