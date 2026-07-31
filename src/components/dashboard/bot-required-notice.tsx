import Link from "next/link";
import { Link2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

/**
 * Shown by every page that cannot do anything until a Telegram bot is
 * connected. Flows, keyword automations and the bot menu each used to carry
 * their own copy of this alert, all pointing at a settings modal.
 */
export const BotRequiredNotice = () => (
  <Alert
    variant="info"
    title="ابتدا ربات تلگرام را متصل کنید"
    description="ربات، دروازهٔ همهٔ گفتگوهاست؛ تا وصل نشود این بخش کاری برای انجام دادن ندارد."
  >
    <Link
      href="/dashboard/bot"
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "mt-3",
      })}
    >
      <Link2 className="size-4" aria-hidden />
      اتصال ربات تلگرام
    </Link>
  </Alert>
);
