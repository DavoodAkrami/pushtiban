"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { Badge } from "@/components/ui/badge";
import type { AppIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The channel switch above the automation panels.
//
// Automation is automation; the channel is a filter on it. Which is why this is
// a row of chips under the page tabs rather than a second tab strip: the tabs
// answer "what kind of rule", the chips answer "on which channel", and the two
// questions are independent.
//
// The choice lives in a ?channel= search param rather than useState, so a
// channel + tab combination can be linked to and survives a refresh. It is
// still UI state — nothing about it belongs in Redux.
// ---------------------------------------------------------------------------

export type ChannelId = "telegram" | "instagram";

export type ChannelAvailability = {
  /** False when the channel is connected but this page has nothing for it. */
  supported?: boolean;
  /** False when the business has not connected this channel yet. */
  connected?: boolean;
};

type ChannelDefinition = {
  id: ChannelId;
  label: string;
  icon: AppIcon;
};

const CHANNELS: ChannelDefinition[] = [
  { id: "telegram", label: "تلگرام", icon: Send },
  { id: "instagram", label: "اینستاگرام", icon: TbBrandInstagram },
];

export const isChannelId = (value: unknown): value is ChannelId =>
  value === "telegram" || value === "instagram";

/**
 * Read the active channel from the URL.
 *
 * `fallback` is the channel a page defaults to, which is not always Telegram:
 * the comment rules page has no Telegram side at all.
 */
export const useActiveChannel = (fallback: ChannelId = "telegram") => {
  const searchParams = useSearchParams();
  const requested = searchParams.get("channel");
  return isChannelId(requested) ? requested : fallback;
};

export const ChannelTabs = ({
  active,
  availability,
  className,
}: {
  active: ChannelId;
  /** Per-channel state; anything omitted is treated as supported and connected. */
  availability?: Partial<Record<ChannelId, ChannelAvailability>>;
  className?: string;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectChannel = (channel: ChannelId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("channel", channel);
    // replace, not push: flipping between channels is not a navigation the back
    // button should have to walk through.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="کانال‌ها"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {CHANNELS.map((channel) => {
        const state = availability?.[channel.id] ?? {};
        const supported = state.supported ?? true;
        const connected = state.connected ?? true;
        const disabled = !supported || !connected;
        const isActive = active === channel.id && !disabled;

        // The chip says why it cannot be picked. A greyed-out control with no
        // reason is the thing this replaces.
        const reason = !supported
          ? channel.id === "telegram"
            ? "مخصوص اینستاگرام"
            : "به‌زودی"
          : !connected
            ? "وصل نیست"
            : null;

        return (
          <button
            key={channel.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => selectChannel(channel.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              isActive
                ? "border-accent/40 bg-accent/10 text-accent"
                : disabled
                  ? "cursor-not-allowed border-line bg-surface/20 text-muted"
                  : "border-line bg-surface/40 text-foreground hover:bg-surface/70"
            )}
          >
            <channel.icon className="size-4" aria-hidden />
            {channel.label}
            {reason && (
              <Badge variant="muted" className="ms-1">
                {reason}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
};
