"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  Bot,
  History,
  Layers,
  LibraryBig,
  LifeBuoy,
  MessageCircleQuestion,
  MessagesSquare,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type AppIcon } from "@/components/ui/icon";
import { luxe } from "@/components/motion/reveal";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// One real customer question, and the four things the assistant is handed
// before it answers. Steps 0-3 light one ingredient each; the last step is the
// reply.
//
// Every ingredient and every bubble stays in the DOM at every step — the step
// drives emphasis only, never `display: none` and never `aria-hidden` — so a
// screen reader, a no-JS render and a reduced-motion reader all get the whole
// illustration at once. The auto-play is pure enhancement on top of that.
// ---------------------------------------------------------------------------

type Provenance = "you" | "auto" | "customer";

const PROVENANCE: Record<
  Provenance,
  { label: string; icon: AppIcon; strong: boolean }
> = {
  you: { label: "شما نوشته‌اید", icon: User, strong: true },
  auto: { label: "خودکار", icon: Zap, strong: false },
  customer: { label: "از مشتری", icon: MessageCircleQuestion, strong: false },
};

type Ingredient = {
  id: string;
  /** Short label for the step rail. */
  short: string;
  icon: AppIcon;
  title: string;
  caption: string;
  provenance: Provenance;
  /** What is actually handed over, for this one example. */
  sample: { role: string; text: string }[];
};

const INGREDIENTS: Ingredient[] = [
  {
    id: "persona",
    short: "لحن",
    icon: Sparkles,
    title: "لحن و معرفی",
    caption: "شما نوشته‌اید دستیار کیست و چطور حرف بزند.",
    provenance: "you",
    sample: [
      { role: "کسب‌وکار", text: "کفش رضا — فروش کفش ورزشی" },
      {
        role: "دستور شما",
        text: "کوتاه و محترم جواب بده. چیزی را که نمی‌دانی حدس نزن.",
      },
    ],
  },
  {
    id: "knowledge",
    short: "دانش",
    icon: LibraryBig,
    title: "دانش کسب‌وکار",
    caption: "از هرچه وارد کرده‌اید، فقط مرتبط‌ترین‌ها انتخاب می‌شوند.",
    provenance: "you",
    sample: [
      { role: "دانستهٔ شما", text: "ارسال به تهران: ۱ روز کاری" },
      {
        role: "دانستهٔ شما",
        text: "موجودی لحظه‌ای انبار را به همکار انسانی ارجاع بده.",
      },
    ],
  },
  {
    id: "memory",
    short: "گفتگو",
    icon: History,
    title: "گفتگوی همین حالا",
    caption: "چند پیام آخر، تا «سایز ۴۳ش» معنا داشته باشد.",
    provenance: "auto",
    sample: [
      { role: "مشتری", text: "سلام، مدل ران‌فست را در پیج دیدم" },
      { role: "دستیار", text: "سلام! ران‌فست یکی از پرفروش‌های ماست." },
    ],
  },
  {
    id: "message",
    short: "سوال",
    icon: MessageCircleQuestion,
    title: "پیام تازهٔ مشتری",
    caption: "سوالی که جریان‌ها و کلیدواژه‌های آماده جوابش را نداشتند.",
    provenance: "customer",
    sample: [
      { role: "مشتری", text: "سایز ۴۳ش را دارید؟ چند روزه به تهران می‌رسد؟" },
    ],
  },
];

/** The step that shows the reply — one past the last ingredient. */
const REPLY_STEP = INGREDIENTS.length;

/**
 * The example thread. `ties` names the ingredient a bubble belongs to, so
 * highlighting a step also rings the bubbles it came from: the reader sees that
 * «گفتگوی همین حالا» *is* those two earlier messages.
 */
const THREAD: {
  from: "customer" | "assistant";
  text: string;
  ties: "memory" | "message" | "reply";
}[] = [
  { from: "customer", text: "سلام، مدل ران‌فست را در پیج دیدم", ties: "memory" },
  {
    from: "assistant",
    text: "سلام! ران‌فست یکی از پرفروش‌های ماست.",
    ties: "memory",
  },
  {
    from: "customer",
    text: "سایز ۴۳ش را دارید؟ چند روزه به تهران می‌رسد؟",
    ties: "message",
  },
];

const REPLY =
  "ارسال به تهران یک روز کاری است. برای موجودی سایز ۴۳ اجازه بدهید همکارم بررسی کند — همین حالا پیام شما را برایش می‌فرستم.";

/* ------------------------------- small parts ------------------------------ */

const ProvenanceChip = ({ provenance }: { provenance: Provenance }) => {
  const { label, icon: Glyph, strong } = PROVENANCE[provenance];
  return (
    <Badge
      variant={strong ? "default" : "muted"}
      className="shrink-0 px-2 py-0.5 text-[11px] font-normal"
    >
      <Glyph className="size-3" aria-hidden />
      {label}
    </Badge>
  );
};

const SampleRow = ({ role, text }: { role: string; text: string }) => (
  <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-background/50 px-3 py-2">
    <span className="shrink-0 text-[11px] leading-5 text-muted">{role}</span>
    <span className="min-w-0 text-[13px] leading-6">{text}</span>
  </li>
);

type CardState = "active" | "revealed" | "waiting";

const IngredientCard = ({
  ingredient,
  index,
  state,
}: {
  ingredient: Ingredient;
  index: number;
  state: CardState;
}) => (
  <li
    className={cn(
      "rounded-2xl border p-4 transition-colors duration-700 ease-luxe",
      state === "active"
        ? "border-accent/30 bg-accent/[0.07]"
        : state === "revealed"
          ? "border-line bg-surface/50"
          : "border-transparent bg-surface/20"
    )}
  >
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold transition-colors duration-700 ease-luxe",
          state === "waiting"
            ? "bg-line text-muted"
            : "bg-accent/15 text-accent"
        )}
      >
        {fa(index + 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-sm font-extrabold">{ingredient.title}</h4>
          <ProvenanceChip provenance={ingredient.provenance} />
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          {ingredient.caption}
        </p>
        <motion.ul
          className="mt-2.5 space-y-1.5"
          animate={{ opacity: state === "waiting" ? 0 : 1 }}
          transition={{ duration: 0.5, ease: luxe }}
        >
          {ingredient.sample.map((row) => (
            <SampleRow key={row.text} role={row.role} text={row.text} />
          ))}
        </motion.ul>
      </div>
    </div>
  </li>
);

const Bubble = ({
  from,
  text,
  highlight,
  earlier,
  children,
}: {
  from: "customer" | "assistant";
  text: string;
  highlight?: boolean;
  earlier?: boolean;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      "flex items-end gap-2",
      from === "customer" ? "justify-start" : "justify-end"
    )}
  >
    {from === "assistant" && (
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
      >
        <Bot className="size-3.5" />
      </span>
    )}
    <div
      className={cn(
        "max-w-[85%] rounded-2xl border px-3.5 py-2.5 transition-all duration-700 ease-luxe",
        from === "customer"
          ? "border-line bg-surface/70"
          : "border-line bg-card/80",
        earlier && !highlight && "opacity-70",
        highlight && "border-accent/40 ring-1 ring-accent/25"
      )}
    >
      <p className="text-[13px] leading-6">{text}</p>
      {children}
    </div>
  </div>
);

const TypingDots = () => (
  <div className="flex items-center gap-1" role="status" aria-label="در حال نوشتن">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="size-1.5 rounded-full bg-muted"
        animate={{ opacity: [0.25, 1, 0.25] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
      />
    ))}
  </div>
);

/* -------------------------------- step rail ------------------------------- */

/**
 * The rail is the only place a number appears, because here the order IS the
 * information: it is the order the model receives these things in.
 *
 * Plain buttons in a labelled `nav`, not ARIA tabs — nothing is ever hidden, so
 * a tablist would promise a show/hide relationship that does not exist. Same
 * reasoning as `components/ui/page-tabs.tsx`.
 */
const RAIL: { short: string; icon: AppIcon }[] = [
  ...INGREDIENTS.map(({ short, icon }) => ({ short, icon })),
  { short: "پاسخ", icon: Bot },
];

const StageRail = ({
  step,
  reduce,
  onPick,
}: {
  step: number;
  reduce: boolean;
  onPick: (next: number) => void;
}) => {
  const listRef = useRef<HTMLOListElement>(null);

  // On a narrow screen the rail is wider than its container, so auto-play would
  // walk into steps sitting off-screen. Only nudge when the active step really
  // is outside the rail, and nudge the rail itself — `scrollIntoView` would be
  // free to scroll the page vertically too, which on mobile reads as a jump.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !active) return;

    // Physical rects, so this holds in RTL without any scrollLeft sign games.
    const rail = list.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left >= rail.left - 1 && box.right <= rail.right + 1) return;

    list.scrollBy({
      left: box.left + box.width / 2 - (rail.left + rail.width / 2),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [step, reduce]);

  return (
    <nav aria-label="مراحل ساختن پاسخ" className="min-w-0 flex-1">
      <ol
        ref={listRef}
        className="flex items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface/60 p-1"
      >
        {RAIL.map((item, index) => {
          const active = index === step;
          return (
            <li key={item.short} className="shrink-0">
              <button
                type="button"
                onClick={() => onPick(index)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-300 ease-luxe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  active
                    ? "font-extrabold text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    aria-hidden
                    layoutId="feed-stage-step"
                    className="absolute inset-0 rounded-full bg-card shadow-soft"
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.45, ease: luxe }
                    }
                  />
                )}
                <item.icon className="relative size-3.5" aria-hidden />
                <span className="relative">{item.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/* --------------------------------- stage ---------------------------------- */

export const FeedStage = () => {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px -20% 0px" });

  // The complete example is the most useful no-waiting state. The step rail
  // remains available for readers who want to inspect how each input affects
  // the answer, and the play control is an explicit enhancement.
  const [step, setStep] = useState(REPLY_STEP);
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  /** Step whose reply has finished "writing"; -1 before the first one lands. */
  const [writtenAt, setWrittenAt] = useState(REPLY_STEP);

  const atEnd = step >= REPLY_STEP;

  // Auto-play is an enhancement, so it gives up easily: off for reduced
  // motion, off while scrolled away, off while the pointer or the keyboard is
  // inside the stage, off once the reader takes over, and it simply stops
  // scheduling at the reply rather than flipping any state of its own.
  useEffect(() => {
    if (reduce || !inView || !playing || held || step >= REPLY_STEP) return;
    const id = window.setTimeout(
      () => setStep((current) => current + 1),
      step === 0 ? 1600 : 2200
    );
    return () => window.clearTimeout(id);
  }, [reduce, inView, playing, held, step]);

  // A short "writing…" beat before the reply, so the reply reads as a
  // consequence of the four cards rather than a fifth card. Once written, it
  // stays written — a reader stepping back and forth is not made to wait again.
  useEffect(() => {
    if (reduce || step < REPLY_STEP) return;
    const id = window.setTimeout(() => setWrittenAt(step), 900);
    return () => window.clearTimeout(id);
  }, [reduce, step]);

  const pick = (next: number) => {
    setStep(next);
    setPlaying(false);
  };

  const typing = !reduce && atEnd && writtenAt !== step;
  const showReply = reduce || (atEnd && writtenAt === step);
  /** Which ingredient the reader is looking at; null when everything is shown. */
  const activeId = reduce ? null : (INGREDIENTS[step]?.id ?? "reply");

  const cardState = (index: number): CardState => {
    if (reduce) return "revealed";
    if (index === step) return "active";
    return index < step ? "revealed" : "waiting";
  };

  const control = atEnd
    ? {
        icon: RotateCcw,
        label: "بررسی مرحله‌به‌مرحله",
        onClick: () => {
          setWrittenAt(-1);
          setStep(0);
          setPlaying(false);
        },
      }
    : playing
      ? { icon: Pause, label: "توقف نمایش", onClick: () => setPlaying(false) }
      : { icon: Play, label: "ادامهٔ نمایش", onClick: () => setPlaying(true) };

  const Control = control.icon;

  return (
    <figure
      ref={ref}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      className="glass mx-auto w-full max-w-5xl rounded-3xl p-3.5 shadow-lift sm:p-5"
    >
      <div className="flex items-center gap-2">
        <StageRail step={step} reduce={reduce} onPick={pick} />
        {!reduce && (
          <button
            type="button"
            onClick={control.onClick}
            aria-label={control.label}
            title={control.label}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface/60 text-muted transition-colors duration-300 ease-luxe hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Control className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {!reduce && (
        <p className="mt-2 px-1 text-[11px] leading-5 text-muted">
          پاسخ کامل است؛ برای دیدن مسیر ساختن آن، یکی از مرحله‌ها را انتخاب کنید.
        </p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:gap-4">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 px-1 text-[11px] font-extrabold text-muted">
            <Layers className="size-3.5" aria-hidden />
            آنچه دستیار پیش از پاسخ در دست دارد
          </p>
          <ol className="space-y-2">
            {INGREDIENTS.map((ingredient, index) => (
              <IngredientCard
                key={ingredient.id}
                ingredient={ingredient}
                index={index}
                state={cardState(index)}
              />
            ))}
          </ol>
        </div>

        <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-background/40 p-3.5 sm:p-4">
          <p className="mb-3.5 flex items-center gap-2 text-[11px] font-extrabold text-muted">
            <MessagesSquare className="size-3.5" aria-hidden />
            گفتگو در تلگرام یا اینستاگرام
          </p>
          {/* mt-auto: a chat sits at the bottom of its window, and the reply
              needs somewhere to grow into without shoving the thread upward. */}
          <div className="mt-auto space-y-2.5">
            {THREAD.map((bubble) => (
              <Bubble
                key={bubble.text}
                from={bubble.from}
                text={bubble.text}
                earlier={bubble.ties === "memory"}
                highlight={activeId === bubble.ties}
              />
            ))}

            <AnimatePresence initial={false} mode="wait">
              {typing && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: luxe }}
                  className="flex justify-end"
                >
                  <div className="rounded-2xl border border-line bg-card/80 px-4 py-3.5">
                    <TypingDots />
                  </div>
                </motion.div>
              )}

              {showReply && (
                <motion.div
                  key="reply"
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: luxe }}
                >
                  <Bubble from="assistant" text={REPLY} highlight={atEnd}>
                    <span className="mt-2 flex items-center gap-1.5 text-[11px] text-accent">
                      <LifeBuoy className="size-3.5" aria-hidden />
                      موجودی را نمی‌دانست، پس به شما پاس داد
                    </span>
                  </Bubble>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <figcaption className="mt-4 border-t border-line px-1 pt-4 text-center text-xs leading-6 text-muted">
        نمونهٔ یک گفتگوی واقعی. هرچه دستیار در دست دارد، یا شما نوشته‌اید یا مشتری
        گفته است — چیز دیگری به او نمی‌رسد.
      </figcaption>
    </figure>
  );
};



