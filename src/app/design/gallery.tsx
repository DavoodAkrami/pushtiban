"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Bell,
  Bot,
  BrainCircuit,
  Building2,
  Database,
  FileText,
  Globe,
  HelpCircle,
  LineChart,
  Lock,
  Mail,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/components/ui/modal";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonCard,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { GlassCard } from "@/components/ui/glass-card";
import { fa } from "@/lib/utils";

/* ---------------------------------- data --------------------------------- */

const SOURCE_OPTIONS: SelectOption[] = [
  {
    value: "database",
    label: "پایگاه داده",
    description: "PostgreSQL، MySQL و…",
    icon: <Database />,
  },
  {
    value: "docs",
    label: "اسناد و فایل‌ها",
    description: "PDF، Word و متن ساده",
    icon: <FileText />,
  },
  {
    value: "website",
    label: "وب‌سایت",
    description: "ایندکس خودکار صفحات",
    icon: <Globe />,
  },
  {
    value: "telegram",
    label: "کانال تلگرام",
    description: "به‌زودی",
    icon: <Send />,
    disabled: true,
  },
];

const CITY_OPTIONS: SelectOption[] = [
  "تهران",
  "مشهد",
  "اصفهان",
  "شیراز",
  "تبریز",
  "کرج",
  "قم",
  "اهواز",
  "کرمانشاه",
  "رشت",
  "ارومیه",
  "زاهدان",
  "همدان",
  "کرمان",
  "یزد",
].map((c) => ({ value: c, label: c }));

/* ------------------------------- scaffolding ------------------------------ */

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-14 first:border-t-0">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{lead}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 last:mb-0">
      <p className="mb-3.5 text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* --------------------------------- demos ---------------------------------- */

function ButtonsDemo() {
  const [loading, setLoading] = React.useState(false);
  return (
    <>
      <Row label="واریانت‌ها">
        <Button>اصلی</Button>
        <Button variant="secondary">ثانویه</Button>
        <Button variant="outline">خطی</Button>
        <Button variant="ghost">شبح</Button>
        <Button variant="danger">حذف</Button>
        <Button variant="success">تایید</Button>
        <Button variant="link">پیوند متنی</Button>
      </Row>
      <Row label="اندازه‌ها">
        <Button size="lg">بزرگ</Button>
        <Button size="md">متوسط</Button>
        <Button size="sm">کوچک</Button>
        <Button size="icon" aria-label="افزودن">
          <Plus className="size-4" />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="تنظیمات">
          <Settings className="size-4" />
        </Button>
      </Row>
      <Row label="با آیکون">
        <Button startIcon={<Sparkles className="size-4" />}>شروع رایگان</Button>
        <Button variant="secondary" endIcon={<ArrowLeft className="size-4" />}>
          مشاهده دمو
        </Button>
        <Button variant="danger" startIcon={<Trash2 className="size-4" />}>
          حذف ربات
        </Button>
      </Row>
      <Row label="حالت‌ها">
        <Button disabled>غیرفعال</Button>
        <Button variant="secondary" disabled>
          غیرفعال
        </Button>
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 2000);
          }}
        >
          {loading ? "در حال ذخیره…" : "ذخیره تغییرات"}
        </Button>
      </Row>
    </>
  );
}

function InputsDemo() {
  const [email, setEmail] = React.useState("");
  const emailError =
    email.length > 0 && !email.includes("@")
      ? "نشانی ایمیل معتبر نیست؛ مثال: name@company.com"
      : undefined;
  const emailSuccess =
    email.includes("@") && email.includes(".")
      ? "این نشانی قابل استفاده است"
      : undefined;
  return (
    <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
      <Input label="نام کسب‌وکار" placeholder="مثلاً فروشگاه نیلا" required />
      <Input
        label="نشانی ایمیل"
        placeholder="name@company.com"
        dir="ltr"
        className="text-left"
        startIcon={<Mail />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailError}
        success={emailSuccess}
        hint="پاسخ‌ها و گزارش‌ها به این نشانی ارسال می‌شود"
      />
      <Input
        label="جستجو در مکالمات"
        placeholder="عبارت مورد نظر…"
        startIcon={<Search />}
      />
      <Input
        label="گذرواژه"
        type="password"
        placeholder="••••••••"
        startIcon={<Lock />}
        error="گذرواژه باید حداقل ۸ کاراکتر باشد"
      />
      <Input
        label="شناسه ربات"
        defaultValue="pushtiban_nila_bot"
        dir="ltr"
        className="text-left"
        success="این شناسه در دسترس است"
      />
      <Input label="کد معرف" placeholder="اختیاری" disabled hint="به‌زودی فعال می‌شود" />
      <div className="sm:col-span-2">
        <Textarea
          label="پیام خوش‌آمدگویی ربات"
          placeholder="سلام! من دستیار هوشمند فروشگاه هستم…"
          hint="اولین پیامی که مشتری بعد از استارت می‌بیند"
          maxLength={200}
          showCount
          defaultValue="سلام! من دستیار هوشمند فروشگاه نیلا هستم. هر سوالی درباره محصولات دارید بپرسید."
        />
      </div>
      <div className="sm:col-span-2">
        <Textarea
          label="توضیحات"
          placeholder="…"
          error="این فیلد نمی‌تواند خالی باشد"
          required
        />
      </div>
    </div>
  );
}

function SelectsDemo() {
  const [source, setSource] = React.useState<string>();
  const [city, setCity] = React.useState<string>();
  return (
    <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
      <Select
        label="نوع منبع داده"
        options={SOURCE_OPTIONS}
        value={source}
        onChange={setSource}
        placeholder="یک منبع انتخاب کنید"
        hint="بعد از اتصال، هوش مصنوعی به‌صورت خودکار یاد می‌گیرد"
        required
      />
      <Select
        label="شهر (با جستجو)"
        options={CITY_OPTIONS}
        value={city}
        onChange={setCity}
        searchable
        placeholder="شهر خود را پیدا کنید"
        searchPlaceholder="نام شهر را بنویسید…"
      />
      <Select
        label="پلن اشتراک"
        options={[
          { value: "free", label: "رایگان", description: fa("100") + " مکالمه در ماه" },
          { value: "pro", label: "حرفه‌ای", description: fa("5000") + " مکالمه در ماه" },
          { value: "enterprise", label: "سازمانی", description: "نامحدود" },
        ]}
        error="برای ادامه باید یک پلن انتخاب کنید"
      />
      <Select
        label="منطقه سرور"
        options={[{ value: "ir", label: "ایران — تهران" }]}
        value="ir"
        success="نزدیک‌ترین منطقه به کاربران شما"
        disabled
      />
    </div>
  );
}

function ModalsDemo() {
  const { toast } = useToast();
  return (
    <Row label="نمونه‌ها">
      <Modal>
        <ModalTrigger asChild>
          <Button variant="secondary">افزودن منبع داده</Button>
        </ModalTrigger>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>اتصال منبع داده جدید</ModalTitle>
            <ModalDescription>
              منبع را انتخاب کنید؛ پشتیبان چند دقیقه بعد یادگیری را کامل می‌کند.
            </ModalDescription>
          </ModalHeader>
          <div className="space-y-5">
            <Select
              label="نوع منبع"
              options={SOURCE_OPTIONS}
              placeholder="انتخاب کنید"
            />
            <Input
              label="نام نمایشی"
              placeholder="مثلاً کاتالوگ محصولات"
              required
            />
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="ghost">انصراف</Button>
            </ModalClose>
            <ModalClose asChild>
              <Button
                onClick={() =>
                  toast({
                    variant: "success",
                    title: "منبع داده متصل شد",
                    description: "یادگیری به‌صورت خودکار آغاز شد.",
                  })
                }
              >
                اتصال منبع
              </Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal>
        <ModalTrigger asChild>
          <Button variant="danger" startIcon={<Trash2 className="size-4" />}>
            حذف ربات
          </Button>
        </ModalTrigger>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>ربات حذف شود؟</ModalTitle>
            <ModalDescription>
              تمام مکالمات و تنظیمات «پشتیبان نیلا» برای همیشه پاک می‌شود. این
              کار قابل بازگشت نیست.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="ghost">انصراف</Button>
            </ModalClose>
            <ModalClose asChild>
              <Button
                variant="danger"
                onClick={() =>
                  toast({
                    variant: "error",
                    title: "ربات حذف شد",
                    description: "پشتیبان نیلا و همه داده‌هایش پاک شد.",
                  })
                }
              >
                بله، حذف کن
              </Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal>
        <ModalTrigger asChild>
          <Button variant="outline">مودال خیلی بزرگ</Button>
        </ModalTrigger>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>گزارش هفتگی عملکرد</ModalTitle>
            <ModalDescription>
              خلاصه مکالمات و رضایت مشتریان در هفت روز گذشته.
            </ModalDescription>
          </ModalHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "مکالمات", value: fa("8420") },
              { label: "پاسخ خودکار", value: fa("94") + "٪" },
              { label: "رضایت", value: fa("4.8") + " از " + fa("5") },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-card/70 p-4 text-center">
                <p className="text-2xl font-extrabold">{s.value}</p>
                <p className="mt-1 text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="secondary">بستن</Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Row>
  );
}

function ToastsDemo() {
  const { toast } = useToast();
  return (
    <Row label="کلیک کنید تا اعلان نمایش داده شود">
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: "به‌روزرسانی در دسترس است",
            description: "نسخه جدید داشبورد آماده استفاده است.",
          })
        }
      >
        اعلان ساده
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "info",
            title: "یادگیری در حال انجام است",
            description: fa("2400") + " سند در صف پردازش قرار دارد.",
          })
        }
      >
        اطلاع‌رسانی
      </Button>
      <Button
        variant="success"
        onClick={() =>
          toast({
            variant: "success",
            title: "تغییرات ذخیره شد",
            description: "تنظیمات ربات با موفقیت به‌روزرسانی شد.",
          })
        }
      >
        موفقیت
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          toast({
            variant: "error",
            title: "اتصال برقرار نشد",
            description: "پایگاه داده در دسترس نیست. تنظیمات اتصال را بررسی کنید.",
            action: { label: "تلاش دوباره", onClick: () => {} },
          })
        }
      >
        خطا + اقدام
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "warning",
            title: "به سقف پلن نزدیک شده‌اید",
            description: fa("92") + "٪ از مکالمات این ماه استفاده شده است.",
            action: { label: "ارتقای پلن", onClick: () => {} },
          })
        }
      >
        هشدار
      </Button>
    </Row>
  );
}

function AlertsDemo() {
  const [visible, setVisible] = React.useState(true);
  return (
    <div className="max-w-2xl space-y-4">
      <Alert
        title="یادگیری کامل شد"
        description={"هوش مصنوعی " + fa("2400") + " محصول را ایندکس کرد و آماده پاسخ‌گویی است."}
        variant="success"
      />
      <Alert
        title="پرداخت ناموفق بود"
        description="کارت بانکی شما پذیرفته نشد. روش پرداخت را به‌روزرسانی کنید تا سرویس قطع نشود."
        variant="error"
      />
      <Alert
        title="گواهی دامنه رو به انقضاست"
        description={"گواهی SSL دامنه شما " + fa(5) + " روز دیگر منقضی می‌شود."}
        variant="warning"
      />
      <Alert
        title="نکته"
        description="با اتصال سوالات متداول، دقت پاسخ‌ها به‌طور محسوسی بالا می‌رود."
        variant="info"
      />
      {visible ? (
        <Alert
          title="حالت آزمایشی فعال است"
          description="داده‌های این محیط هر شب پاک می‌شود."
          onDismiss={() => setVisible(false)}
        />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setVisible(true)}>
          نمایش دوباره اعلان قابل‌بستن
        </Button>
      )}
    </div>
  );
}

function TooltipsDemo() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  return (
    <Row label="روی دکمه‌ها مکث کنید">
      <Tooltip content="جستجو در مکالمات">
        <Button variant="secondary" size="icon-sm" aria-label="جستجو">
          <Search className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip
        content={sidebarOpen ? "بستن سایدبار" : "باز کردن سایدبار"}
        side="bottom"
      >
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={sidebarOpen ? "بستن سایدبار" : "باز کردن سایدبار"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </Button>
      </Tooltip>
      <Tooltip content="پاسخ‌ها فقط از داده‌های خود شما ساخته می‌شود" side="end">
        <Button variant="ghost" size="icon-sm" aria-label="راهنما">
          <HelpCircle className="size-4" />
        </Button>
      </Tooltip>
      <Tooltip content="حذف برای همیشه" side="top">
        <Button variant="danger" size="icon-sm" aria-label="حذف">
          <Trash2 className="size-4" />
        </Button>
      </Tooltip>
    </Row>
  );
}

function AtomsDemo() {
  return (
    <>
      <Row label="نشان‌ها">
        <Badge>پیش‌فرض</Badge>
        <Badge variant="accent">جدید</Badge>
        <Badge variant="success" dot>
          آنلاین
        </Badge>
        <Badge variant="error" dot>
          قطع اتصال
        </Badge>
        <Badge variant="warning">در انتظار</Badge>
        <Badge variant="muted">پیش‌نویس</Badge>
      </Row>
      <Row label="انتخاب و کلید">
        <div className="flex flex-col gap-4">
          <Checkbox label="ارسال گزارش هفتگی به ایمیل" defaultChecked />
          <Checkbox
            label="ارجاع خودکار به اپراتور"
            description="وقتی هوش مصنوعی مطمئن نیست، مکالمه به تیم شما منتقل می‌شود"
          />
          <Checkbox label="غیرفعال" disabled />
          <Switch label="پاسخ‌گویی خودکار" defaultChecked />
          <Switch label="حالت تعمیر و نگهداری" />
          <Switch label="غیرفعال" disabled />
        </div>
      </Row>
      <Row label="بارگذاری">
        <Spinner size="sm" />
        <Spinner size="md" className="text-accent" />
        <Spinner size="lg" className="text-muted" />
      </Row>
    </>
  );
}

function IconsDemo() {
  const glyphs = [
    { icon: Bot, label: "ربات" },
    { icon: BrainCircuit, label: "هوش مصنوعی" },
    { icon: Database, label: "پایگاه داده" },
    { icon: Send, label: "تلگرام" },
    { icon: Globe, label: "وب‌سایت" },
    { icon: FileText, label: "اسناد" },
    { icon: LineChart, label: "تحلیل" },
    { icon: ShieldCheck, label: "امنیت" },
    { icon: Zap, label: "سرعت" },
    { icon: Bell, label: "اعلان" },
    { icon: User, label: "کاربر" },
    { icon: Building2, label: "سازمان" },
    { icon: Search, label: "جستجو" },
    { icon: PanelRightOpen, label: "باز کردن سایدبار" },
    { icon: PanelRightClose, label: "بستن سایدبار" },
  ];
  return (
    <>
      <Row label="اندازه‌ها و رنگ‌ها">
        <Icon icon={Bot} size="xs" tone="muted" />
        <Icon icon={Bot} size="sm" tone="muted" />
        <Icon icon={Bot} size="md" />
        <Icon icon={Bot} size="lg" tone="accent" />
        <Icon icon={Bot} size="xl" tone="accent" />
        <Icon icon={Bot} size="md" tone="success" />
        <Icon icon={Bot} size="md" tone="danger" />
        <Icon icon={Bot} size="md" tone="warning" />
      </Row>
      <Row label="کاشی آیکون — الگوی اصلی محصول">
        <Icon icon={Sparkles} tile size="sm" />
        <Icon icon={Sparkles} tile />
        <Icon icon={Sparkles} tile size="lg" />
        <Icon icon={Database} tile tone="success" />
        <Icon icon={Trash2} tile tone="danger" />
        <Icon icon={Bell} tile tone="warning" />
        <Icon icon={Settings} tile tone="muted" />
      </Row>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {glyphs.map((g) => (
          <div
            key={g.label}
            className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-surface/40 py-5"
          >
            <Icon icon={g.icon} tile size="sm" />
            <span className="text-xs text-muted">{g.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ColorsDemo() {
  const tokens = [
    { name: "background", cls: "bg-background", hex: "#191919" },
    { name: "surface", cls: "bg-surface", hex: "#202020" },
    { name: "card", cls: "bg-card", hex: "#2F2F2F" },
    { name: "accent", cls: "bg-accent", hex: "#4F8CFF" },
    { name: "success", cls: "bg-success", hex: "#4AC484" },
    { name: "danger", cls: "bg-danger", hex: "#EB6B63" },
    { name: "warning", cls: "bg-warning", hex: "#E2A354" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {tokens.map((t) => (
        <div key={t.name} className="overflow-hidden rounded-2xl border border-line">
          <div className={`h-16 ${t.cls}`} />
          <div className="bg-surface/60 px-3 py-2 [font-feature-settings:normal]">
            <p className="text-xs font-bold" dir="ltr">
              {t.name}
            </p>
            <p className="text-[11px] text-muted" dir="ltr">
              {t.hex}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button
      variant="secondary"
      size="icon-sm"
      aria-label="تغییر حالت روشن و تاریک"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

function GalleryInner() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-28 pt-14 sm:px-8">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Badge variant="accent" className="mb-4">
            نسخه {fa("1.0")}
          </Badge>
          <h1 className="text-3xl font-black sm:text-4xl">سیستم طراحی پشتیبان</h1>
          <p className="mt-3 max-w-xl leading-8 text-muted">
            تمام اجزای رابط کاربری — از اتم‌ها تا الگوهای کامل — با همان زبان
            بصری صفحه اصلی: سطوح آرام، شیشه نرم و یک آبی برای لحظه‌های مهم.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSwitcher />
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm text-muted transition-colors duration-300 hover:bg-line/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            صفحه اصلی
            <ArrowLeft className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <Section title="رنگ‌ها" lead="توکن‌های پایه؛ در هر دو حالت تاریک و روشن یکسان نام‌گذاری شده‌اند.">
        <ColorsDemo />
      </Section>

      <Section title="دکمه‌ها" lead="هفت واریانت، پنج اندازه، حالت بارگذاری و آیکون‌دار.">
        <ButtonsDemo />
      </Section>

      <Section
        title="ورودی‌ها"
        lead="ورودی متن و چندخطی با برچسب، راهنما، خطا، موفقیت، آیکون و شمارنده کاراکتر."
      >
        <InputsDemo />
      </Section>

      <Section
        title="انتخاب‌گرها"
        lead="منوی انتخاب با توضیحات و آیکون، نسخه جستجودار، و حالت‌های خطا و غیرفعال. با صفحه‌کلید هم کار می‌کند."
      >
        <SelectsDemo />
      </Section>

      <Section title="مودال‌ها" lead="چهار اندازه؛ فرم، تایید حذف و محتوای عریض. Esc و کلیک بیرون می‌بندد.">
        <ModalsDemo />
      </Section>

      <Section title="اعلان‌های شناور" lead="پنج نوع اعلان با بستن خودکار، دکمه اقدام و انباشته‌شدن.">
        <ToastsDemo />
      </Section>

      <Section title="اعلان‌های درون‌صفحه" lead="برای پیام‌های ماندگار داخل فرم‌ها و صفحات.">
        <AlertsDemo />
      </Section>

      <Section title="اتم‌ها" lead="نشان‌ها، چک‌باکس، کلید و نشانگر بارگذاری.">
        <AtomsDemo />
      </Section>

      <Section title="تول‌تیپ" lead="راهنمای کوتاه روی هاور و فوکوس؛ در چهار جهت.">
        <TooltipsDemo />
      </Section>

      <Section
        title="اسکلتون"
        lead="جای‌نگه‌دار بارگذاری برای کارت‌ها، متن و بلوک‌های بزرگ."
      >
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <SkeletonCard />
          <div className="rounded-3xl border border-line bg-surface/40 p-7">
            <div className="mb-4 flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <SkeletonText lines={3} />
          </div>
          <div className="sm:col-span-2">
            <SkeletonBlock />
          </div>
        </div>
      </Section>

      <Section title="آیکون‌ها" lead="آیکون‌های Lucide با اندازه‌ها و رنگ‌های سیستم، به‌همراه کاشی نرم — امضای بصری محصول.">
        <IconsDemo />
      </Section>

      <Section title="کارت شیشه‌ای" lead="سطح اصلی محتوا؛ با درخشش دنباله‌روی نشانگر.">
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <GlassCard className="p-7">
            <Icon icon={BrainCircuit} tile className="mb-5" />
            <h3 className="mb-2 text-lg font-bold">پایگاه دانش هوشمند</h3>
            <p className="text-sm leading-7 text-muted">
              نشانگر را روی کارت حرکت دهید تا درخشش نرم آن را ببینید.
            </p>
          </GlassCard>
          <GlassCard className="p-7">
            <div className="mb-5 flex items-center justify-between">
              <Icon icon={Send} tile tone="success" />
              <Badge variant="success" dot>
                فعال
              </Badge>
            </div>
            <h3 className="mb-2 text-lg font-bold">ربات تلگرام نیلا</h3>
            <p className="text-sm leading-7 text-muted">
              {fa("1348")} مکالمه امروز — {fa("94")}٪ پاسخ خودکار
            </p>
          </GlassCard>
        </div>
      </Section>
    </main>
  );
}

export function DesignGallery() {
  return (
    <ToastProvider>
      <GalleryInner />
    </ToastProvider>
  );
}
