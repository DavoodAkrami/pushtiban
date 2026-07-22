"use client";

import * as React from "react";
import { cn, fa } from "@/lib/utils";
import {
  FieldWrapper,
  fieldStateClasses,
  getFieldDirection,
  type FieldWrapperProps,
} from "@/components/ui/input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldWrapperProps {
  /** Shows a live character counter when maxLength is set. */
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      label,
      hint,
      error,
      success,
      required,
      showCount,
      maxLength,
      id: idProp,
      onChange,
      defaultValue,
      value,
      rows,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId();
    const id = idProp ?? autoId;
    const state = error ? "error" : success ? "success" : "default";
    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      defaultValue ?? ""
    );
    const currentValue = value ?? uncontrolledValue;
    const direction = getFieldDirection(currentValue);
    const count = String(currentValue).length;

    return (
      <FieldWrapper
        id={id}
        label={label}
        hint={hint}
        error={error}
        success={success}
        required={required}
      >
        <div className="relative" dir={direction}>
          <textarea
            {...props}
            id={id}
            ref={ref}
            dir={direction}
            rows={rows ?? 4}
            maxLength={maxLength}
            value={value}
            defaultValue={defaultValue}
            aria-invalid={!!error || undefined}
            aria-describedby={
              error || success || hint ? `${id}-message` : undefined
            }
            aria-required={required || undefined}
            onChange={(e) => {
              setUncontrolledValue(e.target.value);
              onChange?.(e);
            }}
            className={cn(
              fieldStateClasses(state),
              "min-h-28 px-4 py-3 leading-7",
              showCount && maxLength && "pb-8",
              className,
              "resize-none text-start"
            )}
          />
          {showCount && maxLength && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 end-4 text-[11px] tabular-nums text-muted/80"
            >
              {fa(count)} / {fa(maxLength)}
            </span>
          )}
        </div>
      </FieldWrapper>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
