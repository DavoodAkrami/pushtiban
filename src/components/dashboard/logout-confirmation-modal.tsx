"use client";

import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";

type LogoutConfirmationModalProps = {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  restoreFocus: () => void;
  signingOut: boolean;
};

export const LogoutConfirmationModal = ({
  open,
  onConfirm,
  onOpenChange,
  restoreFocus,
  signingOut,
}: LogoutConfirmationModalProps) => (
  <Modal
    open={open}
    onOpenChange={(nextOpen) => {
      if (!signingOut) onOpenChange(nextOpen);
    }}
  >
    <ModalContent
      size="sm"
      closeDisabled={signingOut}
      onEscapeKeyDown={(event) => {
        if (signingOut) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (signingOut) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}
    >
      <ModalHeader>
        <ModalTitle>از حساب خارج شوید؟</ModalTitle>
        <ModalDescription>
          آیا مطمئنید می‌خواهید از حساب خود خارج شوید؟ برای ورود دوباره باید
          ایمیل و رمز عبورتان را وارد کنید.
        </ModalDescription>
      </ModalHeader>

      <ModalFooter className="flex-col sm:flex-row">
        <ModalClose asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={signingOut}
            className="w-full sm:w-auto"
          >
            انصراف
          </Button>
        </ModalClose>
        <Button
          type="button"
          variant="danger"
          loading={signingOut}
          onClick={onConfirm}
          className="w-full sm:w-auto"
        >
          خروج از حساب
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
