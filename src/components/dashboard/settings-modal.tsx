"use client";

import * as React from "react";
import { Building2, Link2, Mail, Send, UserRound } from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { ConnectionFlow } from "@/components/dashboard/bot/connection-flow";
import { InstagramConnectionFlow } from "@/components/dashboard/instagram/connection-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";
import { BUSINESS_CATEGORIES, isBusinessCategory } from "@/lib/business-categories";
import { createClient } from "@/lib/supabase/client";
import type { SettingsSection } from "@/lib/settings-events";

type ProfileDetails = {
  fullName: string;
  businessName: string;
  businessCategory: string;
};

type SettingsModalProps = ProfileDetails & {
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileUpdated: (profile: ProfileDetails) => void;
  restoreFocus: () => void;
  initialSection?: SettingsSection;
};

const BUSINESS_CATEGORY_OPTIONS: SelectOption[] = BUSINESS_CATEGORIES.map(
  (category) => ({
    value: category.slug,
    label: category.label,
    description: category.description,
  })
);


const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "پروفایل", icon: UserRound },
  { id: "business", label: "اطلاعات کسب‌وکار", icon: Building2 },
  { id: "connections", label: "اتصالات", icon: Link2 },
];

// Ordered the way a business adopts them: Telegram carries the automations and
// the bot menu today, Instagram is connection-only until DM handling ships.
const CHANNELS: {
  id: "telegram" | "instagram";
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    id: "telegram",
    label: "تلگرام",
    description: "اتصال ربات پیام‌رسان تلگرام",
    icon: Send,
  },
  {
    id: "instagram",
    label: "اینستاگرام",
    description: "اتصال حساب تجاری برای پاسخ به دایرکت‌ها",
    icon: TbBrandInstagram,
  },
];

export const SettingsModal = ({
  businessCategory,
  businessName,
  email,
  fullName,
  initialSection = "profile",
  open,
  onOpenChange,
  onProfileUpdated,
  restoreFocus,
}: SettingsModalProps) => {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("profile");
  const [draftFullName, setDraftFullName] = React.useState(fullName);
  const [draftBusinessName, setDraftBusinessName] =
    React.useState(businessName);
  const [draftBusinessCategory, setDraftBusinessCategory] =
    React.useState(businessCategory);
  const [savedFullName, setSavedFullName] = React.useState(fullName);
  const [savedBusinessName, setSavedBusinessName] =
    React.useState(businessName);
  const [savedBusinessCategory, setSavedBusinessCategory] =
    React.useState(businessCategory);
  const [fullNameError, setFullNameError] = React.useState("");
  const [businessNameError, setBusinessNameError] = React.useState("");
  const [businessCategoryError, setBusinessCategoryError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const headingId = `settings-${activeSection}-title`;

  React.useEffect(() => {
    if (!open) return;
    // Profile is the landing section: an unknown value would render a modal
    // with a section list and an empty pane, which is never what a caller
    // meant to ask for.
    setActiveSection(
      SECTIONS.some((section) => section.id === initialSection)
        ? initialSection
        : "profile"
    );
    const nextFullName = fullName.trim();
    const nextBusinessName = businessName.trim();
    const nextBusinessCategory = businessCategory.trim();
    setDraftFullName(nextFullName);
    setDraftBusinessName(nextBusinessName);
    setDraftBusinessCategory(nextBusinessCategory);
    setSavedFullName(nextFullName);
    setSavedBusinessName(nextBusinessName);
    setSavedBusinessCategory(nextBusinessCategory);
    setFullNameError("");
    setBusinessNameError("");
    setBusinessCategoryError("");
  }, [businessCategory, businessName, fullName, initialSection, open]);

  const normalizedFullName = draftFullName.trim();
  const normalizedBusinessName = draftBusinessName.trim();
  const normalizedBusinessCategory = draftBusinessCategory.trim();
  const hasProfileChanges = normalizedFullName !== savedFullName;
  const hasBusinessChanges =
    normalizedBusinessName !== savedBusinessName ||
    normalizedBusinessCategory !== savedBusinessCategory;

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextFullNameError =
      normalizedFullName.length < 3 || normalizedFullName.length > 80
        ? `نام شما باید بین ${fa(3)} تا ${fa(80)} حرف باشد.`
        : "";
    setFullNameError(nextFullNameError);
    if (nextFullNameError || !hasProfileChanges) return;

    setSaving(true);
    let profileSaved = false;

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast({
          title: "ذخیره پروفایل انجام نشد",
          description: "صفحه را تازه‌سازی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: normalizedFullName,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (profileError || !updatedProfile) {
        toast({
          title: "ذخیره پروفایل انجام نشد",
          description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      profileSaved = true;
      const updatedDetails = {
        fullName: normalizedFullName,
        businessName: savedBusinessName,
        businessCategory: savedBusinessCategory,
      };
      setDraftFullName(normalizedFullName);
      setSavedFullName(normalizedFullName);
      onProfileUpdated(updatedDetails);

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedFullName,
        },
      });

      toast({
        title: "تغییرات پروفایل ذخیره شد",
        description: metadataError
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "نام شما به‌روزرسانی شد.",
        variant: metadataError ? "warning" : "success",
      });
    } catch {
      toast({
        title: profileSaved
          ? "تغییرات پروفایل ذخیره شد"
          : "ذخیره پروفایل انجام نشد",
        description: profileSaved
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: profileSaved ? "warning" : "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveBusinessInfo = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextBusinessNameError =
      normalizedBusinessName.length < 2 ||
      normalizedBusinessName.length > 100
        ? `نام کسب‌وکار باید بین ${fa(2)} تا ${fa(100)} حرف باشد.`
        : "";
    const nextBusinessCategoryError = isBusinessCategory(
      normalizedBusinessCategory
    )
      ? ""
      : "دسته کسب‌وکارتان را انتخاب کنید.";

    setBusinessNameError(nextBusinessNameError);
    setBusinessCategoryError(nextBusinessCategoryError);
    if (nextBusinessNameError || nextBusinessCategoryError || !hasBusinessChanges)
      return;

    setSaving(true);
    let profileSaved = false;

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast({
          title: "ذخیره اطلاعات کسب‌وکار انجام نشد",
          description: "صفحه را تازه‌سازی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          business_name: normalizedBusinessName,
          business_category: normalizedBusinessCategory,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (profileError || !updatedProfile) {
        toast({
          title: "ذخیره اطلاعات کسب‌وکار انجام نشد",
          description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      profileSaved = true;
      const updatedDetails = {
        fullName: savedFullName,
        businessName: normalizedBusinessName,
        businessCategory: normalizedBusinessCategory,
      };
      setDraftBusinessName(normalizedBusinessName);
      setDraftBusinessCategory(normalizedBusinessCategory);
      setSavedBusinessName(normalizedBusinessName);
      setSavedBusinessCategory(normalizedBusinessCategory);
      onProfileUpdated(updatedDetails);

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { business_name: normalizedBusinessName },
      });

      toast({
        title: "اطلاعات کسب‌وکار ذخیره شد",
        description: metadataError
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "نام و دسته کسب‌وکار به‌روزرسانی شد.",
        variant: metadataError ? "warning" : "success",
      });
    } catch {
      toast({
        title: profileSaved
          ? "اطلاعات کسب‌وکار ذخیره شد"
          : "ذخیره اطلاعات کسب‌وکار انجام نشد",
        description: profileSaved
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: profileSaved ? "warning" : "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        className="h-[min(42rem,calc(100dvh-2.5rem))] overflow-hidden p-0"
      >
        <div className="flex h-full min-h-0 flex-col md:flex-row">
          <aside className="shrink-0 border-b border-line bg-surface/55 p-4 backdrop-blur-2xl sm:p-5 md:w-64 md:border-b-0 md:border-e md:px-4 md:py-6">
            <ModalHeader className="mb-5 pe-10 md:mb-7 md:pe-0">
              <ModalTitle>تنظیمات</ModalTitle>
              <ModalDescription className="sr-only">
                تنظیمات حساب پشتیبان
              </ModalDescription>
            </ModalHeader>

            <nav aria-label="بخش‌های تنظیمات">
              <ul className="space-y-1">
                {SECTIONS.map((section) => {
                  const active = activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          active
                            ? "bg-card/70 text-foreground"
                            : "text-muted hover:bg-card/40 hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-xl",
                            active ? "bg-accent/15 text-accent" : "bg-transparent"
                          )}
                        >
                          <section.icon className="size-4" aria-hidden />
                        </span>
                        <span className="truncate text-sm font-medium">
                          {section.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <section
            aria-labelledby={headingId}
            className="flex min-h-0 min-w-0 flex-1 bg-background"
          >
            {activeSection === "profile" && (
              <form
                onSubmit={saveProfile}
                noValidate
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10">
                  <header className="pe-10">
                    <h2 id={headingId} className="text-xl font-bold">
                      اطلاعات شما
                    </h2>
                    <p className="mt-1.5 text-sm leading-7 text-muted">
                      نام صاحب حساب و ایمیل ورود شما در این بخش قرار دارد.
                    </p>
                  </header>

                  <div className="mt-7 rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
                    <Input
                      id="settings-full-name"
                      label="نام شما"
                      hint="برای شناسایی صاحب این حساب استفاده می‌شود."
                      value={draftFullName}
                      onChange={(event) => {
                        setDraftFullName(event.target.value);
                        if (fullNameError) setFullNameError("");
                      }}
                      error={fullNameError}
                      startIcon={<UserRound />}
                      autoComplete="name"
                      minLength={3}
                      maxLength={80}
                      disabled={saving}
                      required
                    />

                    <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-background/55 p-4 sm:flex-row sm:items-center">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                          <Mail className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-muted">ایمیل ورود</span>
                          <span
                            dir="ltr"
                            className="mt-0.5 block break-all text-start text-sm font-medium"
                          >
                            {email || "—"}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs leading-6 text-muted sm:ms-auto sm:max-w-48">
                        این همان ایمیلی است که با آن وارد می‌شوید و فعلاً قابل تغییر نیست.
                      </span>
                    </div>
                  </div>
                </div>

                <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line bg-surface/30 px-5 py-4 sm:px-7 lg:px-10">
                  <Button
                    type="submit"
                    className="flex-1 sm:flex-none"
                    loading={saving}
                    disabled={!hasProfileChanges}
                  >
                    ذخیره تغییرات
                  </Button>
                </footer>
              </form>
            )}

            {activeSection === "business" && (
              <form
                onSubmit={saveBusinessInfo}
                noValidate
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10">
                  <header className="pe-10">
                    <h2 id={headingId} className="text-xl font-bold">
                      اطلاعات کسب‌وکار
                    </h2>
                    <p className="mt-1.5 text-sm leading-7 text-muted">
                      نام و حوزه فعالیت کسب‌وکارتان را برای نمایش در داشبورد و شخصی‌سازی دستیار تغییر دهید.
                    </p>
                  </header>

                  <div className="mt-7 rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
                    <div className="space-y-5">
                      <Input
                        id="settings-business-name"
                        label="نام کسب‌وکار"
                        hint="این نام در منوی داشبورد و پیام‌های مدیریتی نمایش داده می‌شود."
                        value={draftBusinessName}
                        onChange={(event) => {
                          setDraftBusinessName(event.target.value);
                          if (businessNameError) setBusinessNameError("");
                        }}
                        error={businessNameError}
                        startIcon={<Building2 />}
                        autoComplete="organization"
                        minLength={2}
                        maxLength={100}
                        disabled={saving}
                        required
                      />
                      <Select
                        id="settings-business-category"
                        label="دسته کسب‌وکار"
                        hint="این انتخاب به دستیار کمک می‌کند پاسخ‌ها را با فضای کسب‌وکار شما هماهنگ کند."
                        options={BUSINESS_CATEGORY_OPTIONS}
                        value={draftBusinessCategory}
                        onChange={(value) => {
                          setDraftBusinessCategory(value);
                          if (businessCategoryError) setBusinessCategoryError("");
                        }}
                        error={businessCategoryError}
                        searchable
                        disabled={saving}
                        required
                      />
                    </div>
                  </div>
                </div>

                <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line bg-surface/30 px-5 py-4 sm:px-7 lg:px-10">
                  <Button
                    type="submit"
                    className="flex-1 sm:flex-none"
                    loading={saving}
                    disabled={!hasBusinessChanges}
                  >
                    ذخیره اطلاعات کسب‌وکار
                  </Button>
                </footer>
              </form>
            )}

            {activeSection === "connections" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10">
                  <header className="pe-10">
                    <h2 id={headingId} className="text-xl font-bold">
                      اتصالات
                    </h2>
                    <p className="mt-1.5 text-sm leading-7 text-muted">
                      کانال‌های پشتیبانی خود را به پشتیبان متصل کنید. هر کانال
                      جداگانه وصل می‌شود و بقیه را متوقف نمی‌کند.
                    </p>
                  </header>

                  <div className="mt-7 space-y-5">
                    {CHANNELS.map((channel) => (
                      <section
                        key={channel.id}
                        aria-label={channel.label}
                        className="rounded-3xl border border-line bg-surface/35 p-5 sm:p-6"
                      >
                        <div className="mb-5 flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                            <channel.icon className="size-5" aria-hidden />
                          </span>
                          <div>
                            <p className="text-sm font-bold">{channel.label}</p>
                            <p className="text-xs text-muted">
                              {channel.description}
                            </p>
                          </div>
                        </div>

                        {channel.id === "telegram" ? (
                          <ConnectionFlow />
                        ) : (
                          <InstagramConnectionFlow returnTo="settings" />
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </ModalContent>
    </Modal>
  );
};
