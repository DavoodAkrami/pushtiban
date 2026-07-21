import { redirect } from "next/navigation";

/** /dashboard has no content of its own — overview is the first section. */
export default function DashboardIndex() {
  redirect("/dashboard/overview");
}
