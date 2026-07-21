"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Search, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";
import {
  FieldWrapper,
  fieldStateClasses,
  type FieldWrapperProps,
} from "@/components/ui/input";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends FieldWrapperProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Adds a search box that filters options as you type. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Select({
  options,
  value: valueProp,
  onChange,
  placeholder = "انتخاب کنید",
  searchable = false,
  searchPlaceholder = "جستجو…",
  emptyText = "موردی پیدا نشد",
  disabled,
  label,
  hint,
  error,
  success,
  required,
  className,
  id: idProp,
}: SelectProps) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const listboxId = `${id}-listbox`;
  const reduce = useReducedMotion();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [internal, setInternal] = React.useState<string | undefined>(valueProp);
  const value = valueProp ?? internal;
  const [activeIndex, setActiveIndex] = React.useState(-1);
  // Viewport-aware placement: flip above the trigger when the space below
  // is too tight, and cap the list height so every option stays reachable.
  const [placement, setPlacement] = React.useState<"bottom" | "top">("bottom");
  const [maxListHeight, setMaxListHeight] = React.useState(256);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim();
    return options.filter(
      (o) => o.label.includes(q) || o.description?.includes(q)
    );
  }, [options, query, searchable]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Focus search when opening
  React.useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Measure available space on open (and while scrolling/resizing) to pick
  // a side and a height that keep the whole list on screen.
  React.useLayoutEffect(() => {
    if (!open) return;
    const GAP = 8; // mt-2 between trigger and menu
    const MARGIN = 12; // breathing room from the viewport edge
    const SEARCH_H = searchable ? 44 : 0;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP - MARGIN;
      const above = rect.top - GAP - MARGIN;
      const fitsBelow = below >= Math.min(256, above);
      const side = fitsBelow ? "bottom" : "top";
      setPlacement(side);
      const room = (side === "bottom" ? below : above) - SEARCH_H;
      setMaxListHeight(Math.max(120, Math.min(256, room)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, searchable]);

  // Keep the active option in view
  React.useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const commit = (option: SelectOption) => {
    if (option.disabled) return;
    if (valueProp === undefined) setInternal(option.value);
    onChange?.(option.value);
    close();
    triggerRef.current?.focus();
  };

  const move = (dir: 1 | -1) => {
    if (!filtered.length) return;
    let next = activeIndex;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + dir + filtered.length) % filtered.length;
      if (!filtered[next].disabled) break;
    }
    setActiveIndex(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
          triggerRef.current?.focus();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          if (activeIndex >= 0 && filtered[activeIndex])
            commit(filtered[activeIndex]);
        }
        break;
      case " ":
        // Space toggles only from the trigger — inside search it types a space.
        if (!open && e.target === triggerRef.current) {
          e.preventDefault();
          setOpen(true);
        }
        break;
      case "Tab":
        if (open) close();
        break;
    }
  };

  const state = error ? "error" : success ? "success" : "default";

  return (
    <FieldWrapper
      id={id}
      label={label}
      hint={hint}
      error={error}
      success={success}
      required={required}
    >
      <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error || success || hint ? `${id}-message` : undefined
          }
          onClick={() => (open ? close() : setOpen(true))}
          className={cn(
            fieldStateClasses(state),
            "flex h-12 items-center justify-between gap-3 px-4 text-start",
            open && "border-accent/60",
            className
          )}
        >
          <span
            className={cn(
              "flex min-w-0 items-center gap-2.5",
              !selected && "text-muted/70"
            )}
          >
            {selected?.icon && (
              <span className="shrink-0 text-muted [&>svg]:size-4">
                {selected.icon}
              </span>
            )}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-300 ease-luxe",
              open && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={
                reduce
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      y: placement === "bottom" ? -6 : 6,
                      scale: 0.98,
                    }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      y: placement === "bottom" ? -4 : 4,
                      scale: 0.98,
                    }
              }
              transition={{ duration: 0.22, ease: luxe }}
              className={cn(
                "absolute z-50 w-full overflow-hidden rounded-2xl border border-line bg-card shadow-lift",
                placement === "bottom"
                  ? "top-full mt-2"
                  : "bottom-full mb-2"
              )}
            >
              {searchable && (
                <div className="relative border-b border-line">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 start-4 my-auto size-4 text-muted"
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="h-11 w-full bg-transparent ps-11 pe-4 text-sm placeholder:text-muted/70 focus:outline-none"
                  />
                </div>
              )}
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={label ?? placeholder}
                style={{ maxHeight: maxListHeight }}
                className="overflow-y-auto p-1.5"
              >
                {filtered.length === 0 && (
                  <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
                    <SearchX className="size-5" aria-hidden />
                    {emptyText}
                  </li>
                )}
                {filtered.map((option, i) => {
                  const isSelected = option.value === value;
                  return (
                    <li
                      key={option.value}
                      data-index={i}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      onPointerMove={() => setActiveIndex(i)}
                      onClick={() => commit(option)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
                        activeIndex === i && "bg-line/60",
                        option.disabled &&
                          "cursor-not-allowed opacity-40"
                      )}
                    >
                      {option.icon && (
                        <span className="shrink-0 text-muted [&>svg]:size-4">
                          {option.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description && (
                          <span className="block truncate text-xs text-muted">
                            {option.description}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check
                          className="size-4 shrink-0 text-accent"
                          aria-hidden
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FieldWrapper>
  );
}
