import { Bot } from "lucide-react";

const LINK_GROUPS = [
  {
    title: "محصول",
    links: ["امکانات", "تعرفه‌ها", "یکپارچه‌سازی", "تغییرات جدید"],
  },
  {
    title: "شرکت",
    links: ["درباره ما", "وبلاگ", "فرصت‌های شغلی", "تماس با ما"],
  },
  {
    title: "پشتیبانی",
    links: ["مرکز راهنما", "مستندات API", "وضعیت سرویس", "گزارش مشکل"],
  },
  {
    title: "حقوقی",
    links: ["حریم خصوصی", "شرایط استفاده", "امنیت داده‌ها"],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <a href="#" className="flex items-center gap-2.5 font-bold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white">
                <Bot className="size-4" aria-hidden />
              </span>
              پشتیبان
            </a>
            <p className="mt-4 max-w-xs text-sm leading-7 text-muted">
              پلتفرم هوش مصنوعی پشتیبانی مشتریان؛ ساخته‌شده برای کسب‌وکارهایی
              که به کیفیت اهمیت می‌دهند.
            </p>
          </div>
          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="mb-4 text-sm font-bold">{group.title}</p>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted transition-colors duration-300 hover:text-accent"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 border-t border-line pt-8 text-center text-xs text-muted">
          <p>© ۱۴۰۵ پشتیبان. تمام حقوق محفوظ است.</p>
        </div>
      </div>
    </footer>
  );
}
