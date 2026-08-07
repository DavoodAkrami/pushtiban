import { InstagramTabs } from "./instagram-tabs";

const InstagramLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-5xl">
    <InstagramTabs />
    {children}
  </div>
);

export default InstagramLayout;
