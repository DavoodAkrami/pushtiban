import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { ToastProvider } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "داشبورد — پشتیبان",
  description: "مدیریت دستیار هوشمند پشتیبانی مشتریان شما.",
};

const DashboardLayout = async ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, business_name, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && !profile.onboarding_completed_at) redirect("/onboarding");

  const metadataBusinessName =
    typeof user.user_metadata?.business_name === "string"
      ? user.user_metadata.business_name.trim()
      : "";
  const businessName = profile?.business_name?.trim() || metadataBusinessName;
  const metadataFullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  const fullName = profile?.full_name?.trim() || metadataFullName;

  return (
    <ToastProvider>
      <DashboardShell
        businessName={businessName}
        fullName={fullName}
        email={user.email ?? ""}
      >
        {children}
      </DashboardShell>
    </ToastProvider>
  );
};

export default DashboardLayout;
