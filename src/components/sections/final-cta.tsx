"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, WordReveal } from "@/components/motion/reveal";
import { Section } from "@/components/ui/section";

export function FinalCta() {
  const router = useRouter();
  return (
    <Section className="overflow-hidden">
      <div className="glass relative overflow-hidden rounded-5xl px-6 py-20 text-center md:py-28">
        {/* glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-96 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]"
        />
        <Reveal>
          <span className="mx-auto mb-8 flex size-16 items-center justify-center rounded-3xl bg-accent text-white shadow-glow">
            <Bot className="size-7" aria-hidden />
          </span>
        </Reveal>
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-black leading-snug md:text-[2.75rem] md:leading-[1.3]">
          <WordReveal text="مشتریان شما منتظر پاسخ نمانند" accentWords={["پاسخ"]} />
        </h2>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-5 max-w-xl text-balance leading-8 text-muted">
            همین امروز پشتیبان را رایگان امتحان کنید و اولین پاسخ هوشمند را در
            کمتر از ده دقیقه به مشتریان‌تان تحویل دهید.
          </p>
        </Reveal>
        <Reveal delay={0.45}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => router.push("/auth")}>
              شروع رایگان
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="lg">
              گفتگو با تیم فروش
            </Button>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
