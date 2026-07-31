import { redirect } from "next/navigation";

/**
 * The RAG playground now lives inside the dashboard as the preview pane on
 * /dashboard/assistant, where it is behind the auth proxy and calls the same
 * generator the Telegram webhook uses.
 */
const LegacyRagTestPage = () => redirect("/dashboard/assistant");

export default LegacyRagTestPage;
