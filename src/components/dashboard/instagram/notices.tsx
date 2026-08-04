import Link from "next/link";
import { TbBrandInstagram } from "react-icons/tb";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

/**
 * Shown by every Instagram page that cannot do anything until the account is
 * connected. The Instagram counterpart of BotRequiredNotice.
 */
export const InstagramRequiredNotice = () => (
  <Alert
    variant="info"
    title="ابتدا حساب اینستاگرام را متصل کنید"
    description="تا حساب تجاری اینستاگرام وصل نشود، کامنت‌ها و دایرکت‌ها به پشتیبان نمی‌رسند."
  >
    <Link
      href="/dashboard/instagram"
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "mt-3",
      })}
    >
      <TbBrandInstagram className="size-4" aria-hidden />
      اتصال حساب اینستاگرام
    </Link>
  </Alert>
);

/**
 * The account granted messaging but not comments — it connected before comment
 * automation existed. Meta will not widen a token in place, so the only fix is
 * another trip through the consent screen. Said plainly, because a comment rule
 * saved against this account would look fine and never fire.
 */
export const InstagramCommentScopeNotice = () => (
  <Alert
    variant="warning"
    title="دسترسی کامنت‌ها داده نشده است"
    description="این حساب پیش از افزوده شدن اتوماسیون کامنت وصل شده است. یک‌بار دیگر وصل شوید تا اجازهٔ خواندن و پاسخ به کامنت‌ها هم داده شود."
  >
    <a
      href="/api/instagram/connect?return=instagram"
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "mt-3",
      })}
    >
      <TbBrandInstagram className="size-4" aria-hidden />
      اتصال دوباره
    </a>
  </Alert>
);
