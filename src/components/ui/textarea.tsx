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
  /**
   * Grows the field with its content instead of scrolling at a fixed height.
   * The travel is bounded by the `min-h-*` / `max-h-*` classes on the field,
   * so a caller decides how small it rests and how tall it may get.
   */
  autoResize?: boolean;
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
      autoResize,
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
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    // The measurement needs the node, the caller usually wants it too (to focus
    // the field after sending), so the forwarded ref is mirrored rather than
    // handed over.
    const attachRef = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    // Height follows the content: reset to auto so it can shrink again, then
    // take scrollHeight — which counts padding but not the border, while
    // border-box height does, hence the two border widths added back.
    React.useEffect(() => {
      const node = innerRef.current;
      if (!autoResize || !node) return;
      node.style.height = "auto";
      const styles = window.getComputedStyle(node);
      const borders =
        parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
      node.style.height = `${node.scrollHeight + borders}px`;
    }, [autoResize, currentValue]);

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
            ref={attachRef}
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
              autoResize && "overflow-y-auto",
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
