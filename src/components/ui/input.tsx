"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldState = "default" | "error" | "success";

export interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  success?: string;
  required?: boolean;
}

/** Shared label / message chrome for inputs, textareas and selects. */
export function FieldWrapper({
  id,
  label,
  hint,
  error,
  success,
  required,
  children,
}: FieldWrapperProps & { id: string; children: React.ReactNode }) {
  const message = error ?? success ?? hint;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-2 block text-sm font-medium">
          {label}
          {required && (
            <span className="ms-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {message && (
        <p
          id={`${id}-message`}
          role={error ? "alert" : undefined}
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs leading-5",
            error ? "text-danger" : success ? "text-success" : "text-muted"
          )}
        >
          {error && <AlertCircle className="size-3.5 shrink-0" aria-hidden />}
          {success && (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          )}
          {message}
        </p>
      )}
    </div>
  );
}

export function fieldStateClasses(state: FieldState) {
  return cn(
    // Notion-style focus: the border deepens — no outline, no ring flash
    "w-full rounded-2xl border bg-surface/60 text-sm text-foreground transition-colors duration-300 ease-luxe placeholder:text-muted/70",
    "outline-none focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    state === "error"
      ? "border-danger/50 focus:border-danger"
      : state === "success"
        ? "border-success/50 focus:border-success"
        : "border-line focus:border-accent/60 focus:bg-surface"
  );
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    FieldWrapperProps {
  /** Icon rendered at the start edge of the field (right side in RTL). */
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      hint,
      error,
      success,
      required,
      startIcon,
      endIcon,
      id: idProp,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId();
    const id = idProp ?? autoId;
    const state: FieldState = error ? "error" : success ? "success" : "default";
    return (
      <FieldWrapper
        id={id}
        label={label}
        hint={hint}
        error={error}
        success={success}
        required={required}
      >
        <div className="relative">
          {startIcon && (
            <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-muted [&>svg]:size-4">
              {startIcon}
            </span>
          )}
          <input
            id={id}
            ref={ref}
            aria-invalid={!!error || undefined}
            aria-describedby={
              error || success || hint ? `${id}-message` : undefined
            }
            aria-required={required || undefined}
            className={cn(
              fieldStateClasses(state),
              "h-12 px-4",
              startIcon && "ps-11",
              endIcon && "pe-11",
              className
            )}
            {...props}
          />
          {endIcon && (
            <span className="absolute inset-y-0 end-4 flex items-center text-muted [&>svg]:size-4">
              {endIcon}
            </span>
          )}
        </div>
      </FieldWrapper>
    );
  }
);
Input.displayName = "Input";

export { Input };
