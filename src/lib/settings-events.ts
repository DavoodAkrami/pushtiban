export type SettingsSection = "profile" | "business" | "connections";

export const SETTINGS_OPEN_EVENT = "pushtiban:open-settings";
export const TELEGRAM_CONNECTION_CHANGED_EVENT =
  "pushtiban:telegram-connection-changed";

export const requestSettingsOpen = (section: SettingsSection) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SETTINGS_OPEN_EVENT, { detail: { section } })
  );
};

export const notifyTelegramConnectionChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TELEGRAM_CONNECTION_CHANGED_EVENT));
};
