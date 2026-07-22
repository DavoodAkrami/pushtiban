"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";

/**
 * Modal — Radix Dialog (focus trap, Esc, outside click) animated with
 * Framer Motion. `Modal` owns the open state so `ModalContent` can run
 * a proper exit animation through AnimatePresence.
 */
const ModalContext = React.createContext<{ open: boolean }>({ open: false });

const ModalTrigger = DialogPrimitive.Trigger;
const ModalClose = DialogPrimitive.Close;

const Modal = ({
  children,
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: DialogPrimitive.DialogProps) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolled;
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        setUncontrolled(v);
        onOpenChange?.(v);
      }}
      {...props}
    >
      <ModalContext.Provider value={{ open }}>{children}</ModalContext.Provider>
    </DialogPrimitive.Root>
  );
};

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
} as const;

const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeDisabled?: boolean;
    size?: keyof typeof SIZES;
  }
>(
  ({ className, children, closeDisabled = false, size = "md", ...props }, ref) => {
  const { open } = React.useContext(ModalContext);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />
          </DialogPrimitive.Overlay>
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5">
            <DialogPrimitive.Content
              asChild
              forceMount
              ref={ref}
              dir="rtl"
              {...props}
            >
              <motion.div
                initial={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }
                }
                transition={{ duration: reduce ? 0 : 0.32, ease: luxe }}
                className={cn(
                  "glass-strong relative w-full rounded-3xl p-7 shadow-lift outline-none",
                  SIZES[size],
                  className
                )}
              >
                {children}
                <DialogPrimitive.Close
                  aria-label="بستن"
                  disabled={closeDisabled}
                  className="absolute end-5 top-5 flex size-8 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-line/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden />
                </DialogPrimitive.Close>
              </motion.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
  }
);
ModalContent.displayName = "ModalContent";

const ModalHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("mb-5 pe-8", className)} {...props} />;
};

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-bold", className)}
    {...props}
  />
));
ModalTitle.displayName = "ModalTitle";

const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1.5 text-sm leading-7 text-muted", className)}
    {...props}
  />
));
ModalDescription.displayName = "ModalDescription";

const ModalFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn("mt-7 flex flex-wrap justify-end gap-3", className)}
      {...props}
    />
  );
};

export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
};
