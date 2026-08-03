export type SettingsSection = "profile" | "business" | "connections";

export const SETTINGS_OPEN_EVENT = "pushtiban:open-settings";

/**
 * Fired whenever any channel is connected or disconnected. The flows, keyword
 * and menu panels all gate themselves on having a channel, so they re-check
 * when this lands rather than waiting for a navigation. The event name keeps
 * its original spelling so nothing has to be renamed twice.
 */
export const CHANNEL_CONNECTION_CHANGED_EVENT =
  "pushtiban:telegram-connection-changed";

/** @deprecated Use CHANNEL_CONNECTION_CHANGED_EVENT — same event, wider scope. */
export const TELEGRAM_CONNECTION_CHANGED_EVENT =
  CHANNEL_CONNECTION_CHANGED_EVENT;

export const requestSettingsOpen = (section: SettingsSection) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SETTINGS_OPEN_EVENT, { detail: { section } })
  );
};

export const notifyChannelConnectionChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANNEL_CONNECTION_CHANGED_EVENT));
};

/** @deprecated Use notifyChannelConnectionChanged. */
export const notifyTelegramConnectionChanged = notifyChannelConnectionChanged;
