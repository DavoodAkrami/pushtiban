"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "icon" | "text" | "full";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-14",
};

const textSizeClasses = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
};

export function Logo({
  variant = "default",
  size = "md",
  className,
}: LogoProps) {
  return (
    <a
      href="/"
      className={cn("flex items-center gap-2.5 font-bold", className)}
      aria-label="پشتیبان - بازگشت به صفحه اصلی"
    >
      {(variant === "default" || variant === "icon" || variant === "full") && (
        <Image
          src="/logo.webp"
          alt=""
          width={32}
          height={32}
          className={cn("flex-shrink-0 rounded-xl", sizeClasses[size])}
          priority
        />
      )}
      {(variant === "default" || variant === "text" || variant === "full") && (
        <span className={cn("hidden md:inline", textSizeClasses[size])}>
          پشتیبان
        </span>
      )}
    </a>
  );
}