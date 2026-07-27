/**
 * The bot's reply-keyboard menu — the row of buttons that sits at the bottom of
 * the Telegram chat instead of the customer's keyboard.
 *
 * Unlike inline buttons (see src/lib/flows.ts) a reply keyboard belongs to the
 * chat rather than to a single message, and pressing a button sends its label
 * back as an ordinary text message. So every button binds a label to a flow or
 * a prepared reply, and the webhook resolves the label the customer sent.
 *
 * Pure module — no server imports — so the dashboard preview renders from the
 * exact payload the webhook sends.
 */

export const MENU_BUTTON_LABEL_MAX_LENGTH = 32;
export const MENU_PLACEHOLDER_MAX_LENGTH = 64;
export const MENU_BUTTONS_PER_ROW_MAX = 4;
export const MENU_ROWS_MAX = 8;
export const MENU_BUTTONS_MAX = 24;

export type MenuButtonActionType = "flow" | "reply";

export type TelegramMenuButton = {
  id: string;
  label: string;
  rowIndex: number;
  position: number;
  actionType: MenuButtonActionType;
  flowId: string | null;
  automationId: string | null;
};

export type TelegramMenu = {
  isEnabled: boolean;
  isPersistent: boolean;
  resizeKeyboard: boolean;
  oneTimeKeyboard: boolean;
  inputFieldPlaceholder: string;
  buttons: TelegramMenuButton[];
};

/** A flow or prepared reply a menu button can point at. */
export type MenuTarget = {
  id: string;
  label: string;
  hint: string;
};

export type MenuTargets = {
  flows: MenuTarget[];
  replies: MenuTarget[];
};

export const DEFAULT_TELEGRAM_MENU: TelegramMenu = {
  isEnabled: false,
  isPersistent: true,
  resizeKeyboard: true,
  oneTimeKeyboard: false,
  inputFieldPlaceholder: "",
  buttons: [],
};

/**
 * Group buttons into the rows Telegram draws, ordered by row then position.
 * Empty rows collapse, so deleting the last button of a row never leaves a gap
 * in the keyboard.
 */
export const toKeyboardRows = (
  buttons: TelegramMenuButton[]
): TelegramMenuButton[][] => {
  const rows = new Map<number, TelegramMenuButton[]>();
  for (const button of buttons) {
    const row = rows.get(button.rowIndex);
    if (row) row.push(button);
    else rows.set(button.rowIndex, [button]);
  }

  return Array.from(rows.entries())
    .sort(([first], [second]) => first - second)
    .map(([, row]) => [...row].sort((a, b) => a.position - b.position))
    .filter((row) => row.length > 0);
};

export type ReplyKeyboardMarkup = {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
};

export type ReplyKeyboardRemove = { remove_keyboard: true };

export const REPLY_KEYBOARD_REMOVE: ReplyKeyboardRemove = {
  remove_keyboard: true,
};

/**
 * Telegram's ReplyKeyboardMarkup for this menu, or null when there is nothing
 * to show (menu switched off, or no buttons with a label).
 */
export const buildReplyKeyboard = (
  menu: TelegramMenu
): ReplyKeyboardMarkup | null => {
  if (!menu.isEnabled) return null;

  const rows = toKeyboardRows(
    menu.buttons.filter((button) => button.label.trim().length > 0)
  );
  if (rows.length === 0) return null;

  const placeholder = menu.inputFieldPlaceholder.trim();

  return {
    keyboard: rows.map((row) =>
      row.map((button) => ({ text: button.label.trim() }))
    ),
    resize_keyboard: menu.resizeKeyboard,
    is_persistent: menu.isPersistent,
    one_time_keyboard: menu.oneTimeKeyboard,
    ...(placeholder ? { input_field_placeholder: placeholder } : {}),
  };
};
