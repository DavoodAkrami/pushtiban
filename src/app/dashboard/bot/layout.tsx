import { BotTabs } from "./bot-tabs";

const BotLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-5xl">
    <BotTabs />
    {children}
  </div>
);

export default BotLayout;
