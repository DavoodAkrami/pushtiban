"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  AI_EXPOSURE_LABELS,
  FIELD_TYPE_LABELS,
  type BusinessDataCollectionDetail,
  type BusinessDataField,
} from "@/lib/business-data/api-types";
import { businessDataRequest, jsonRequest } from "@/lib/business-data/client";
import type {
  BusinessDataAiExposure,
  BusinessDataFieldDefinition,
  BusinessDataFieldType,
} from "@/lib/business-data/types";

export type EditableBusinessDataField = BusinessDataField | BusinessDataFieldDefinition;

type FieldDraft = {
  label: string;
  description: string;
  type: BusinessDataFieldType;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  aiExposure: BusinessDataAiExposure;
  optionsText: string;
};

const fieldDraft = (field: EditableBusinessDataField | null): FieldDraft => ({
  label: field?.label ?? "",
  description: field?.description ?? "",
  type: field?.type ?? "text",
  required: field?.required ?? false,
  searchable: field?.searchable ?? true,
  filterable: field?.filterable ?? false,
  aiExposure: field?.aiExposure ?? "hidden",
  optionsText: field?.validation?.options?.join("\n") ?? "",
});

const isPersistedField = (
  field: EditableBusinessDataField | null
): field is BusinessDataField => Boolean(field && "id" in field);

export const FieldEditorModal = ({
  collection,
  field,
  open,
  onOpenChange,
  onSaved,
  onDraftSaved,
}: {
  collection?: BusinessDataCollectionDetail;
  field: EditableBusinessDataField | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (collection: BusinessDataCollectionDetail) => void;
  onDraftSaved?: (field: BusinessDataFieldDefinition) => void;
}) => {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<FieldDraft>(() => fieldDraft(field));
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const hasRecords = Boolean(collection?.recordCount);
  const persistedField = isPersistedField(field);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label) {
      setError("نام فیلد را وارد کنید.");
      return;
    }
    const options = draft.optionsText
      .split(/\n|،|,/)
      .map((option) => option.trim())
      .filter(Boolean);
    if (draft.type === "select" && !options.length) {
      setError("برای فیلد انتخابی دست‌کم یک گزینه وارد کنید.");
      return;
    }

    const key = field?.key ?? `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const nextField: BusinessDataFieldDefinition = {
      key,
      label,
      description: draft.description,
      type: draft.type,
      role:
        draft.type === "image"
          ? "image"
          : field?.role === "image"
            ? "custom"
            : field?.role ?? "custom",
      required: draft.required,
      searchable: draft.type === "image" ? false : draft.searchable,
      filterable: draft.type === "image" ? false : draft.filterable,
      aiExposure: draft.aiExposure,
      position: "position" in (field ?? {}) && typeof field?.position === "number" ? field.position : 0,
      ...(draft.type === "select"
        ? { validation: { options } }
        : field?.type === draft.type && field.validation
          ? { validation: field.validation }
          : {}),
    };

    if (!collection) {
      onDraftSaved?.(nextField);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const base = `/api/business-data/collections/${collection.id}/fields`;
      const data = await businessDataRequest<{
        collection: BusinessDataCollectionDetail;
      }>(
        persistedField ? `${base}/${field.id}` : base,
        jsonRequest(persistedField ? "PATCH" : "POST", nextField)
      );
      toast({
        title: persistedField ? "فیلد به‌روز شد" : "فیلد افزوده شد",
        variant: "success",
      });
      onOpenChange(false);
      onSaved?.(data.collection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ذخیره فیلد انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <ModalContent
        size="md"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>{field ? "ویرایش فیلد" : "فیلد جدید"}</ModalTitle>
          <ModalDescription>
            نام و تنظیمات این فیلد را برای ورود و استفاده از رکوردها مشخص کنید.
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            {error && <Alert variant="error" title="فیلد ذخیره نشد" description={error} />}
            {hasRecords && persistedField && (
              <Alert
                variant="warning"
                title="ساختار رکوردهای موجود حفظ می‌شود"
                description="تا وقتی مجموعه رکورد دارد، نوع و الزامی‌بودن این فیلد قابل تغییر نیست؛ نام و دسترسی آن همچنان قابل ویرایش است."
              />
            )}
            <Input
              id="field-label"
              label="نام فیلد"
              value={draft.label}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              maxLength={120}
              required
              disabled={saving}
            />
            <Textarea
              id="field-description"
              label="راهنمای کوتاه"
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              maxLength={500}
              rows={2}
              disabled={saving}
            />
            <Select
              id="field-type"
              label="نوع مقدار"
              options={Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              value={draft.type}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  type: value as BusinessDataFieldType,
                  ...(value === "image"
                    ? {
                        searchable: false,
                        filterable: false,
                        aiExposure: "answer" as const,
                      }
                    : {}),
                }))
              }
              disabled={saving || (hasRecords && persistedField)}
            />
            {draft.type === "select" && (
              <Textarea
                id="field-options"
                label="گزینه‌ها"
                hint="هر گزینه را در یک خط بنویسید."
                value={draft.optionsText}
                onChange={(event) => setDraft((current) => ({ ...current, optionsText: event.target.value }))}
                rows={4}
                disabled={saving || (hasRecords && persistedField)}
              />
            )}
            <div className="space-y-4 rounded-2xl border border-line bg-surface/25 p-4">
              <Checkbox
                label="این فیلد الزامی است"
                checked={draft.required}
                onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))}
                disabled={saving || (hasRecords && persistedField)}
              />
              {draft.type === "image" ? (
                <p className="text-xs leading-6 text-muted">
                  تصویر در جستجو یا فیلتر استفاده نمی‌شود؛ دستیار فقط آن را همراه نتیجهٔ مرتبط برای مشتری می‌فرستد.
                </p>
              ) : (
                <>
                  <Checkbox
                    label="در جستجو استفاده شود"
                    checked={draft.searchable}
                    onChange={(event) => setDraft((current) => ({ ...current, searchable: event.target.checked }))}
                    disabled={saving}
                  />
                  <Checkbox
                    label="در فیلترها قابل استفاده باشد"
                    checked={draft.filterable}
                    onChange={(event) => setDraft((current) => ({ ...current, filterable: event.target.checked }))}
                    disabled={saving}
                  />
                </>
              )}
            </div>
            <Select
              id="field-ai-exposure"
              label="دستیار با این فیلد چه می‌کند؟"
              options={Object.entries(AI_EXPOSURE_LABELS).map(([value, label]) => ({ value, label }))}
              value={draft.aiExposure}
              onChange={(value) => setDraft((current) => ({ ...current, aiExposure: value as BusinessDataAiExposure }))}
              disabled={saving}
            />
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {field ? "ذخیره تغییرات" : "افزودن فیلد"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
