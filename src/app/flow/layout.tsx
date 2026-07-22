import DashboardLayout from "@/app/dashboard/layout";

const FlowLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <DashboardLayout>{children}</DashboardLayout>
);

export default FlowLayout;
