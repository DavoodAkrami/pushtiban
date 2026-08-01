"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import { LayoutDashboard, Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";
import { useSessionProfile } from "@/store/use-session";
import { Logo } from "@/components/ui/brand/logo";

const NAV_ITEMS = [
  { label: "امکانات", href: "#features" },
  { label: "نحوه کار", href: "#how-it-works" },
  { label: "یکپارچه‌سازی", href: "#integrations" },
  // تعرفه‌ها فعلا مخفی است — همراه با بخش قیمت‌گذاری برگردانده می‌شود
  // { label: "تعرفه‌ها", href: "#pricing" },
  { label: "سوالات متداول", href: "#faq" },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      aria-label="تغییر حالت روشن و تاریک"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex size-9 items-center justify-center rounded-full text-muted transition-colors duration-300 hover:bg-line/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}

export function Header() {
  const router = useRouter();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Server state — session via the Redux session slice.
  const signedIn = !!useSessionProfile();

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <motion.nav
        aria-label="ناوبری اصلی"
        animate={{
          width: scrolled ? "min(56rem, 100%)" : "min(72rem, 100%)",
        }}
        transition={{ duration: 0.6, ease: luxe }}
        className={cn(
          "flex items-center justify-between gap-4 rounded-full px-5 py-2.5 transition-all duration-500 ease-luxe",
          scrolled
            ? "glass-strong shadow-soft"
            : "border border-transparent bg-transparent"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-full"
          aria-label="پشتیبان - بازگشت به صفحه اصلی"
        >
          <Logo variant="full" size="md" as="span" />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="group relative rounded-full px-4 py-2 text-sm text-muted transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {item.label}
                <span className="absolute inset-x-4 -bottom-px h-px origin-center scale-x-0 bg-accent transition-transform duration-300 ease-luxe group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Button
              size="sm"
              variant="secondary"
              className="hidden sm:inline-flex"
              startIcon={<LayoutDashboard className="size-4" />}
              onClick={() => router.push("/dashboard/overview")}
            >
              داشبورد
            </Button>
          ) : (
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => router.push("/auth")}
            >
              شروع رایگان
            </Button>
          )}
          <button
            aria-label={open ? "بستن منو" : "باز کردن منو"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
            transition={{ duration: 0.35, ease: luxe }}
            className="glass-strong absolute inset-x-4 top-[4.5rem] rounded-3xl p-4 shadow-lift md:hidden"
          >
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl px-4 py-3 text-sm text-muted transition-colors hover:bg-line/50 hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="mt-2 px-2 pb-1">
                {signedIn ? (
                  <Button
                    size="md"
                    variant="secondary"
                    className="w-full"
                    startIcon={<LayoutDashboard className="size-4" />}
                    onClick={() => router.push("/dashboard/overview")}
                  >
                    داشبورد
                  </Button>
                ) : (
                  <Button
                    size="md"
                    className="w-full"
                    onClick={() => router.push("/auth")}
                  >
                    شروع رایگان
                  </Button>
                )}
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
