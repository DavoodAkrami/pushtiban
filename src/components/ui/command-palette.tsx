"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { cn, normalizeFa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// CommandPalette — a keyboard-first launcher over a flat list of actions.
// Radix Dialog supplies the portal, the focus trap and Esc; everything specific
// to a palette (filtering, the active row, the arrow keys) lives here, because
// Radix has no listbox primitive that survives being filtered as you type.
//
// The list is a combobox + listbox rather than a menu: focus never leaves the
// input, so the active row is announced through aria-activedescendant.
// ---------------------------------------------------------------------------

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  /** Any icon component that takes a className — Lucide and react-icons both fit. */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Extra terms to match on — synonyms, English names, related words. */
  keywords?: string[];
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  shortcut?: string;
  onSelect: () => void;
};

export type CommandGroup = {
  id: string;
  label: string;
  items: CommandItem[];
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  placeholder?: string;
  /** Shown when the query matches nothing. */
  emptyState?: React.ReactNode;
  /** Screen-reader name for the dialog. */
  title?: string;
};

/* --------------------------------- matching -------------------------------- */

const EXACT = 100;
const PREFIX = 80;
const WORD_PREFIX = 60;
const SUBSTRING = 40;
const SUBSEQUENCE = 20;

/**
 * Score one candidate string against an already-normalised query. Higher is
 * better, 0 means no match. The tiers are deliberately coarse — the point is
 * that "دانش" ranks the knowledge page above a page that merely contains the
 * word, not that near-ties are resolved precisely.
 */
const scoreText = (text: string, query: string): number => {
  const candidate = normalizeFa(text);
  if (!candidate) return 0;
  if (candidate === query) return EXACT;
  if (candidate.startsWith(query)) return PREFIX;
  if (candidate.includes(` ${query}`)) return WORD_PREFIX;
  if (candidate.includes(query)) return SUBSTRING;

  // Subsequence: every query character appears in order, so "دنش" still finds
  // "دانش". Cheapest tier because it also matches a lot of noise.
  let cursor = 0;
  for (const character of query) {
    cursor = candidate.indexOf(character, cursor) + 1;
    if (cursor === 0) return 0;
  }
  return SUBSEQUENCE;
};

/** Best score across an item's label, description and keywords. */
const scoreItem = (item: CommandItem, query: string): number => {
  let best = scoreText(item.label, query);
  // A keyword hit should never outrank a label hit of the same tier, hence the
  // small penalty — «منو» typed by someone looking for the bot menu should land
  // on «منوی ربات», not on a page that lists it as a synonym.
  for (const keyword of item.keywords ?? []) {
    best = Math.max(best, scoreText(keyword, query) - 5);
  }
  if (item.description) {
    best = Math.max(best, scoreText(item.description, query) - 15);
  }
  return best;
};

const filterGroups = (groups: CommandGroup[], rawQuery: string) => {
  const query = normalizeFa(rawQuery);
  if (!query) return groups.filter((group) => group.items.length > 0);

  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({ item, score: scoreItem(item, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.item),
    }))
    .filter((group) => group.items.length > 0);
};

/* -------------------------------- component -------------------------------- */

/**
 * The query and the highlighted row live here rather than in CommandPalette so
 * that closing the palette discards them: this only mounts while open, so
 * reopening is always a fresh search with no effect needed to reset it.
 */
const PaletteBody = ({
  onOpenChange,
  groups,
  placeholder,
  emptyState,
  title,
}: Required<Pick<CommandPaletteProps, "onOpenChange" | "groups" | "title">> &
  Pick<CommandPaletteProps, "placeholder" | "emptyState">) => {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();
  const inputId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);

  const visibleGroups = React.useMemo(
    () => filterGroups(groups, query),
    [groups, query]
  );

  // One flat list behind the grouped rendering: arrow keys cross group borders
  // without the caller having to think in two dimensions.
  const flatItems = React.useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups]
  );

  const activeItem = flatItems[activeIndex];
  const activeId = activeItem ? `${listId}-${activeItem.id}` : undefined;

  // Keep the highlighted row on screen. "nearest" scrolls the list only, never
  // the page behind it — the same trick PageTabs uses for its active tab.
  React.useEffect(() => {
    if (!activeId) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(activeId)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const select = (item: CommandItem) => {
    onOpenChange(false);
    item.onSelect();
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    // A new query invalidates whatever was highlighted — land on the best
    // match, which the sort has already put first.
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % flatItems.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(
          (index) => (index - 1 + flatItems.length) % flatItems.length
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(flatItems.length - 1);
        break;
      case "Enter":
        // A composing IME is mid-word; Enter is committing it, not choosing.
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (activeItem) select(activeItem);
        break;
      default:
        break;
    }
  };

  return (
    <>
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        برای جستجو تایپ کنید و با کلیدهای بالا و پایین بین نتیجه‌ها جابه‌جا
        شوید.
      </DialogPrimitive.Description>

      <div className="flex items-center gap-3 border-b border-line px-5">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input
          id={inputId}
          autoFocus
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-label={title}
          placeholder={placeholder}
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={title}
        className="max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain p-2"
      >
        {flatItems.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            {emptyState ?? "چیزی پیدا نشد."}
          </p>
        ) : (
          visibleGroups.map((group) => (
            <div key={group.id} className="mb-1 last:mb-0">
              <p
                aria-hidden
                className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted/80"
              >
                {group.label}
              </p>
              <ul>
                {group.items.map((item) => {
                  const active = item.id === activeItem?.id;

                  return (
                    <li key={item.id}>
                      <div
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={active}
                        // Pointer-only affordance: keyboard users drive this
                        // from the input, which keeps aria-activedescendant
                        // authoritative.
                        onPointerMove={() =>
                          setActiveIndex(flatItems.indexOf(item))
                        }
                        onClick={() => select(item)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors duration-200",
                          active ? "bg-card text-foreground" : "text-muted"
                        )}
                      >
                        {item.icon && (
                          <item.icon className="size-4 shrink-0" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="block truncate text-xs text-muted">
                              {item.description}
                            </span>
                          )}
                        </span>
                        {item.shortcut && (
                          <span
                            dir="ltr"
                            className="shrink-0 rounded-lg border border-line px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {item.shortcut}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export const CommandPalette = ({
  open,
  onOpenChange,
  groups,
  placeholder = "جستجو کنید…",
  emptyState,
  title = "جستجو و دستورها",
}: CommandPaletteProps) => {
  const reduce = useReducedMotion();

  return (
    // Root stays mounted across open/close so Radix can return focus to
    // whatever opened the palette; AnimatePresence lives inside it, the same
    // arrangement components/ui/modal uses.
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            {/* Sits above centre: the palette should not jump around as the
                result list grows and shrinks under the input. */}
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-4 pt-[12vh]">
              <DialogPrimitive.Content asChild forceMount dir="rtl">
                <motion.div
                  initial={
                    reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }
                  }
                  transition={{ duration: reduce ? 0 : 0.24, ease: luxe }}
                  className="glass-strong w-full max-w-xl overflow-hidden rounded-3xl shadow-lift outline-none"
                >
                  <PaletteBody
                    onOpenChange={onOpenChange}
                    groups={groups}
                    placeholder={placeholder}
                    emptyState={emptyState}
                    title={title}
                  />
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
};
