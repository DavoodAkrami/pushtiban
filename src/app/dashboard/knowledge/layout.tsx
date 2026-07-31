import { KnowledgeTabs } from "./knowledge-tabs";

const KnowledgeLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-3xl">
    <KnowledgeTabs />
    {children}
  </div>
);

export default KnowledgeLayout;
