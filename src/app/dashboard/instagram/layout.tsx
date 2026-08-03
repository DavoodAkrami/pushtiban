// No tab strip yet — Instagram owns a single screen until DM handling and
// automations arrive and give it siblings, the way /dashboard/bot has them.
const InstagramLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <div className="mx-auto max-w-5xl">{children}</div>
);

export default InstagramLayout;
