import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InboxPanel } from "@/components/dashboard/inbox-panel";

export const metadata: Metadata = {
  title: "صندوق پیام‌ها — پشتیبان",
};

const InboxPage = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pre-fetch initial conversations for server-side render; the panel will
  // re-fetch on the client for live updates. Soft-fail if the inbox schema
  // is not yet set up (the user will see an empty-state with a note).
  let initialConversations: Array<{
    id: string;
    customerDisplayName: string | null;
    customerUsername: string | null;
    lastCustomerMessageText: string | null;
    lastCustomerMessageAt: string | null;
    status: "open" | "answered" | "closed" | "dismissed";
    queuedReason: "ai_unknown" | "customer_request" | "ai_disabled" | "frustration";
    createdAt: string;
  }> = [];
  let setupRequired = false;

  if (user) {
    const { data, error } = await supabase
      .from("support_conversations")
      .select(
        "id, customer_display_name, customer_username, last_customer_message_text, last_customer_message_at, status, queued_reason, created_at"
      )
      .eq("user_id", user.id)
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      setupRequired = ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code);
    } else if (data) {
      initialConversations = data.map((row) => ({
        id: row.id,
        customerDisplayName: row.customer_display_name,
        customerUsername: row.customer_username,
        lastCustomerMessageText: row.last_customer_message_text,
        lastCustomerMessageAt: row.last_customer_message_at,
        status: row.status,
        queuedReason: row.queued_reason,
        createdAt: row.created_at,
      }));
    }
  }

  return (
    <InboxPanel
      initialConversations={initialConversations}
      setupRequired={setupRequired}
    />
  );
};

export default InboxPage;
