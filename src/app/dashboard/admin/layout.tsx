import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side gate shared by every /dashboard/admin/* page — non-admins are
 * redirected before any admin UI renders. A missing is_admin column
 * (admin.sql not run yet) also lands here as "not an admin".
 */
const AdminLayout = async ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) redirect("/dashboard/overview");

  return <>{children}</>;
};

export default AdminLayout;
