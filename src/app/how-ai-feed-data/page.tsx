import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  Gauge,
  History,
  LibraryBig,
  LifeBuoy,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  ToggleLeft,
  Waypoints,
  X,
} from "lucide-react";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section, SectionHeading } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Icon, type AppIcon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Reveal,
  Stagger,
  StaggerItem,
  WordReveal,
} from "@/components/motion/reveal";
import { AmbientBackground } from "@/components/motion/parallax";
import { FeedStage } from "./feed-stage";
import {
  CHUNKS_MAX_PER_USER,
  FACTS_MAX_CHARS,
  FACTS_MAX_COUNT,
} from "@/lib/ai/limits";
import {
  PROMPT_MAX_CHARS,
  PROMPT_MAX_TURNS,
  SESSION_WINDOW_MS,
} from "@/lib/ai/memory";
import { DEFAULT_SIGNUP_MESSAGE_LIMIT } from "@/lib/ai/usage";
import { cn, fa } from "@/lib/utils";

export const metadata: Metadata = {
  title: "دستیار با چه داده‌هایی تغذیه می‌شود — پشتیبان",
  description:
    "دستیار پشتیبان فقط چهار چیز در دست دارد: لحنی که نوشته‌اید، دانشی که وارد کرده‌اید، چند پیام آخر همان گفتگو و سوال تازهٔ مشتری. یک نمونهٔ واقعی، مرحله‌به‌مرحله.",
};

/** Minutes of the session window, straight from the pipeline's own constant. */
const SESSION_WINDOW_MINUTES = Math.round(SESSION_WINDOW_MS / 60_000);

// ---------------------------------------------------------------------------
// The four channels, named. The provenance chip is the load-bearing part: two
// of them are things the owner typed, and the other two cannot be edited at
// all — saying so is the whole point of the page.
// ---------------------------------------------------------------------------

type Channel = {
  icon: AppIcon;
  title: string;
  from: string;
  owned: boolean;
  desc: string;
  links: { href: string; label: string }[];
  /** Shown instead of links when there is nothing to configure. */
  note?: string;
};

const CHANNELS: Channel[] = [
  {
    icon: Sparkles,
    title: "لحن و معرفی",
    from: "شما نوشته‌اید",
    owned: true,
    desc: "دستیار خودش را چه معرفی کند، با چه لحنی حرف بزند و چه کارهایی را انجام ندهد. همین متن، اولین چیزی است که در هر پاسخ می‌خواند.",
    links: [{ href: "/dashboard/assistant/persona", label: "نوشتن لحن و معرفی" }],
  },
  {
    icon: LibraryBig,
    title: "دانش کسب‌وکار",
    from: "شما نوشته‌اید",
    owned: true,
    desc: "نکته‌های همیشگی، پرسش‌وپاسخ‌های آماده و متن فایل‌هایی که وارد کرده‌اید. برای هر سوال فقط مرتبط‌ترین‌ها انتخاب می‌شوند، نه همهٔ آن‌ها.",
    links: [
      { href: "/dashboard/knowledge/sources", label: "منابع دانش" },
      { href: "/dashboard/knowledge/qa", label: "پرسش‌وپاسخ" },
    ],
  },
  {
    icon: History,
    title: "گفتگوی همین حالا",
    from: "خودکار",
    owned: false,
    desc: `چند پیام آخر همین گفتگو، تا «همان را می‌خواهم» معنا داشته باشد. ${fa(SESSION_WINDOW_MINUTES)} دقیقه که از آخرین پیام بگذرد پاک می‌شود و گفتگوی بعدی از صفر شروع می‌کند.`,
    links: [],
    note: "تنظیمی ندارد؛ خودکار است و کوتاه.",
  },
  {
    icon: MessageCircleQuestion,
    title: "پیام تازهٔ مشتری",
    from: "از مشتری",
    owned: false,
    desc: "همان جمله‌ای که مشتری الان نوشته است. اگر جریان‌ها، منوی دکمه‌ها یا کلیدواژه‌های آماده جوابش را داشته باشند، پیام هیچ‌وقت به دستیار نمی‌رسد.",
    links: [],
    note: "دستیار آخرین حلقه است، نه اولین.",
  },
];

/**
 * The negative space. Every line here is enforced somewhere real: retrieval is
 * filtered by business inside the database, chat memory is keyed to one
 * customer on one connection, and nothing in the pipeline browses the web.
 */
const BLOCKED = [
  {
    title: "گفتگوی مشتریان دیگر",
    desc: "حافظهٔ هر گفتگو فقط مال همان مشتری است؛ پیام یکی هرگز در پاسخ دیگری دیده نمی‌شود.",
  },
  {
    title: "دانش کسب‌وکارهای دیگر",
    desc: "جست‌وجوی دانش همان‌جا در پایگاه‌داده به حساب شما محدود شده است، نه در کد.",
  },
  {
    title: "جست‌وجوی اینترنت در لحظهٔ پاسخ",
    desc: "دستیار وب را نمی‌گردد. هرچه نگفته باشید، نمی‌داند — و همین را صادقانه می‌گوید.",
  },
  {
    title: "حساب و پرداخت شما",
    desc: "ایمیل، شمارهٔ تماس و اطلاعات صورت‌حساب هیچ‌وقت داخل پیام نمی‌روند.",
  },
];

const CONTROLS = [
  {
    icon: ToggleLeft,
    title: "سوییچ خودِ شما",
    desc: "در «وضعیت و رفتار» دستیار را روشن یا خاموش می‌کنید — و برای تلگرام و اینستاگرام جداگانه.",
  },
  {
    icon: ShieldCheck,
    title: "کلید کل پلتفرم",
    desc: "اگر لازم شود، پشتیبان می‌تواند هوش مصنوعی را برای همهٔ حساب‌ها یک‌جا موقتاً قطع کند.",
  },
  {
    icon: Gauge,
    title: "سقف ماهانه",
    desc: `هر حساب سقف پیام ماهانه دارد؛ حساب تازه در ماه اول ${fa(DEFAULT_SIGNUP_MESSAGE_LIMIT)} پیام. سقف که پر شود، دستیار ساکت می‌شود و گفتگو به شما می‌رسد.`,
  },
];

/**
 * Everything the body deliberately leaves out. The digits come from the same
 * constants the pipeline enforces, so this section cannot drift from the code.
 */
const DETAILS = [
  {
    q: "حافظهٔ گفتگو دقیقاً چقدر است؟",
    a: `تا ${fa(SESSION_WINDOW_MINUTES)} دقیقه بعد از آخرین پیام، گفتگو زنده حساب می‌شود. از آن حافظه، حداکثر ${fa(PROMPT_MAX_TURNS)} نوبت آخر و در کل ${fa(PROMPT_MAX_CHARS)} نویسه همراه پیام فرستاده می‌شود؛ قدیمی‌ترها اول کنار گذاشته می‌شوند. بعد از آن فاصله، گفتگو سرد است: پیام بعدی بدون هیچ حافظه‌ای شروع می‌شود و دستیار دوباره خودش را معرفی می‌کند.`,
  },
  {
    q: "از دانش من چه مقدارش در هر پاسخ می‌آید؟",
    a: `نکته‌های همیشگی همیشه می‌آیند، تا ${fa(FACTS_MAX_COUNT)} مورد و ${fa(FACTS_MAX_CHARS)} نویسه — قدیمی‌ترها در اولویت‌اند، تا با اضافه کردن نکتهٔ تازه دانستهٔ دستیار زیر و رو نشود. پرسش‌وپاسخ‌ها و تکه‌های فایل‌ها اما فقط وقتی می‌آیند که به سوال مشتری نزدیک باشند. برای هر حساب حداکثر ${fa(CHUNKS_MAX_PER_USER)} تکه ذخیره می‌شود.`,
  },
  {
    q: "اگر دو جا جواب متفاوتی داده باشند؟",
    a: "ترتیب اولویت ثابت است: نکته‌های همیشگی، بعد پرسش‌وپاسخ‌های آماده، و در آخر متن فایل‌ها. یعنی برای اصلاح یک جواب اشتباه، لازم نیست فایل را عوض کنید — یک نکتهٔ همیشگی بنویسید و همان حرف آخر را می‌زند.",
  },
  {
    q: "پیام مشتری قبل از دستیار از کجا می‌گذرد؟",
    a: "اول جریان‌ها، بعد منوی دکمه‌ها، بعد کلیدواژه‌های آماده. هر کدام جواب را داشته باشد، همان‌جا پاسخ داده می‌شود و دستیار حتی خبردار نمی‌شود. دستیار حلقهٔ آخر است — و بعد از او، شما.",
  },
  {
    q: "پاسخ چطور به مشتری می‌رسد؟",
    a: "متن پاسخ پیش از ارسال مرتب می‌شود تا در تلگرام و اینستاگرام خوش‌خوان باشد؛ اگر قالب‌بندی به هر دلیل پذیرفته نشود، همان متن ساده فرستاده می‌شود تا پیام از دست نرود.",
  },
  {
    q: "مصرف چطور حساب می‌شود؟",
    a: "هر پاسخ دستیار ثبت می‌شود و همین‌ها شمارندهٔ پیام‌های باقی‌مانده و نمودارهای مصرف را می‌سازند. آزمایش دستیار در پنل هم یک پیام واقعی است و از همان سقف کم می‌شود.",
  },
];

/* -------------------------------- sections -------------------------------- */

const PageHero = () => (
  <header className="relative overflow-hidden pb-10 pt-32 md:pb-12 md:pt-40">
    <AmbientBackground />
    <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
      <Reveal blur={false} y={16}>
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
          <Waypoints className="size-3.5" aria-hidden />
          دستیار چه می‌خواند
        </span>
      </Reveal>

      <h1 className="text-balance text-4xl font-black leading-[1.3] sm:text-5xl sm:leading-[1.3]">
        <WordReveal
          text="دستیار فقط چیزهایی را می‌داند که خودتان به او داده‌اید"
          accentWords={["خودتان"]}
        />
      </h1>

      <Reveal delay={0.3} y={20}>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-9 text-muted">
          دستیار مثل کارمند تازه‌واردِ شماست. روز اول به او می‌گویید چطور حرف
          بزند، اطلاعات فروشگاه را دستش می‌دهید، و از آن به بعد فقط همان‌ها را
          جواب می‌دهد. پایین ببینید برای یک سوال واقعی چه چیزی دستش است.
        </p>
      </Reveal>

      <Reveal delay={0.45} y={16}>
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-x-reverse divide-line overflow-hidden rounded-3xl border border-line bg-card/40 text-start">
          {[
            { value: fa(4), label: "ورودی روشن" },
            { value: fa(3), label: "دروازهٔ کنترل" },
            { value: fa(1), label: "پاسخ نهایی" },
          ].map((item) => (
            <div key={item.label} className="px-3 py-4 sm:px-5 sm:py-5">
              <p className="text-xl font-black text-accent sm:text-2xl">{item.value}</p>
              <p className="mt-1 text-[11px] leading-5 text-muted sm:text-xs">{item.label}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  </header>
);

const PageMap = () => (
  <nav
  aria-label="بخش‌های صفحه"
    className="sticky top-20 z-20 mx-auto -mb-3 w-full max-w-5xl px-5 sm:top-24 sm:px-8"
  >
    <div className="glass overflow-x-auto rounded-full p-1 shadow-soft">
      <div className="flex min-w-max items-center justify-center gap-1">
        {[
          { href: "#stage", label: "مثال واقعی" },
          { href: "#channels", label: "چهار ورودی" },
          { href: "#blocked", label: "مرزها" },
          { href: "#control", label: "دروازه‌ها" },
          { href: "#details", label: "جزئیات" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full px-3 py-2 text-xs font-medium text-muted transition-colors duration-300 ease-luxe hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:px-4"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  </nav>
);

// Not wrapped in `Section`: the stage follows the hero directly, so it needs a
// tighter top than `section-pad`'s py-24 while keeping the same container.
const Stage = () => (
  <section id="stage" className="relative scroll-mt-24 pb-24 pt-10 md:pb-32 md:pt-14">
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <Reveal y={24}>
        <div className="mx-auto mb-5 max-w-5xl px-1">
          <div className="flex items-center gap-2 text-xs font-extrabold text-accent">
            <ArrowDown className="size-3.5" aria-hidden />
            یک سوال، چهار ورودی، یک پاسخ
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            این نمونه را کامل ببینید یا هر مرحله را جدا انتخاب کنید تا معلوم شود
            کدام بخش از پاسخ از کجا آمده است.
          </p>
        </div>
        <FeedStage />
      </Reveal>
    </div>
  </section>
);

const Channels = () => (
  <Section id="channels" className="scroll-mt-24 bg-surface/60">
    <SectionHeading
      eyebrow="همان چهار چیز، با نامشان"
      title="دو تا را شما می‌نویسید، دو تا خودکار می‌آیند"
      lead="هرکدام یک جای مشخص دارد. آن دو که دست شماست، همین حالا قابل تغییر است."
    />

    <Stagger className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-line bg-card/30">
      {CHANNELS.map((channel, index) => (
        <StaggerItem key={channel.title}>
          <div
            className={cn(
              "grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-5 sm:p-6",
              index > 0 && "border-t border-line"
            )}
          >
            <Icon icon={channel.icon} tile tone={channel.owned ? "accent" : "muted"} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-base font-extrabold">{channel.title}</h3>
                <Badge variant={channel.owned ? "default" : "muted"}>{channel.from}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{channel.desc}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
              {channel.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={buttonVariants({
                    variant: "link",
                    size: "sm",
                    className: "group gap-1.5 px-0",
                  })}
                >
                  {link.label}
                  <ArrowLeft
                    className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              ))}
              {channel.note && <span className="text-xs leading-6 text-muted">{channel.note}</span>}
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  </Section>
);

const Blocked = () => (
  <Section id="blocked" className="scroll-mt-24">
    <SectionHeading
      eyebrow="مرز دانسته‌ها"
      title="فهرست بالا کامل است"
      lead="هر چیزی که اینجا می‌بینید، بیرون از پیام دستیار می‌ماند."
    />

    <Reveal>
      <ul className="mx-auto max-w-3xl divide-y divide-line overflow-hidden rounded-3xl border border-danger/20 bg-danger/[0.035]">
        {BLOCKED.map((item) => (
          <li key={item.title} className="flex items-start gap-4 p-5 sm:p-6">
            <span
              aria-hidden
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold">{item.title}</p>
              <p className="mt-1 text-sm leading-7 text-muted">{item.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </Reveal>

    <Reveal delay={0.15}>
      <p className="mx-auto mt-5 max-w-3xl px-2 text-center text-xs leading-6 text-muted">
        یک استثنای صادقانه: نام و دستهٔ کسب‌وکارتان به دستیار می‌رسد، چون باید
        بداند از طرف کدام فروشگاه حرف می‌زند.
      </p>
    </Reveal>
  </Section>
);

const Control = () => (
  <Section id="control" className="scroll-mt-24 bg-surface/60">
    <SectionHeading
      eyebrow="سه دروازهٔ واقعی"
      title="پیش از هر پاسخ، سه شرط بررسی می‌شود"
      lead="اگر یکی از این دروازه‌ها بسته باشد، دستیار پاسخی تولید نمی‌کند."
    />

    <Reveal>
      <div className="mx-auto max-w-4xl rounded-3xl border border-line bg-card/35 p-3 sm:p-5">
        <ol className="grid gap-3 md:grid-cols-3">
          {CONTROLS.map((item, index) => (
            <li key={item.title} className="relative flex items-start gap-3 rounded-2xl border border-line bg-surface/45 p-4 sm:p-5">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"
              >
                <item.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">
                  <span className="me-2 text-muted">{fa(index + 1)}</span>
                  {item.title}
                </p>
                <p className="mt-1 text-sm leading-7 text-muted">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Reveal>

    <Reveal delay={0.15}>
      <div className="mx-auto mt-4 flex max-w-3xl items-start gap-4 rounded-3xl border border-accent/25 bg-accent/[0.07] p-5 sm:p-6">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"
        >
          <LifeBuoy className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">و اگر نتوانست، به شما پاس می‌دهد</p>
          <p className="mt-1 text-sm leading-7 text-muted">
            هر جا جواب را نداشته باشد یا مشتری بخواهد با یک آدم حرف بزند، گفتگو
            به صندوق پیام شما می‌آید — بدون آنکه دستیار چیزی از خودش بسازد.
          </p>
        </div>
      </div>
    </Reveal>

    <Reveal delay={0.25} blur={false}>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/auth" className={buttonVariants({ size: "lg" })}>
          شروع رایگان
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <Link
          href="/dashboard/assistant"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          تنظیم دستیار من
        </Link>
      </div>
    </Reveal>
  </Section>
);

const Details = () => (
  <Section id="details" className="scroll-mt-24">
    <SectionHeading
      eyebrow="جزئیات دقیق"
      title="اگر عدد و رقمش را می‌خواهید"
      lead="این‌ها همان مقدارهایی است که سیستم واقعاً اعمال می‌کند."
    />

    <Stagger className="mx-auto max-w-2xl">
      <p className="mb-5 text-center text-sm leading-7 text-muted">
        پاسخ کوتاه را بالاتر گفتیم؛ اینجا می‌توانید هر عدد و قاعده را جدا باز کنید.
      </p>
      <Accordion type="single" collapsible defaultValue="detail-0" className="space-y-4">
        {DETAILS.map((item, index) => (
          <StaggerItem key={item.q}>
            <AccordionItem value={`detail-${index}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          </StaggerItem>
        ))}
      </Accordion>
    </Stagger>
  </Section>
);

const HowAiFeedDataPage = () => (
  <>
    <Header />
    <main>
      <PageHero />
      <PageMap />
      <Stage />
      <Channels />
      <Blocked />
      <Control />
      <Details />
    </main>
    <Footer />
  </>
);

export default HowAiFeedDataPage;
