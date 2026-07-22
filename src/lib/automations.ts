export const KEYWORD_MAX_LENGTH = 80;
export const REPLY_MAX_LENGTH = 4096;
export const TELEGRAM_COMMAND_MAX_LENGTH = 32;
export const TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH = 256;
export const TELEGRAM_COMMANDS_MAX_COUNT = 100;

export type AutomationTriggerType = "keyword" | "command";

export type KeywordAutomation = {
  id: string;
  triggerType: AutomationTriggerType;
  keyword: string;
  commandDescription: string | null;
  replyText: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutomationBot = {
  id: string;
  name: string;
  username: string;
  status: "verified" | "active" | "error";
};

export const cleanKeyword = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

export const normalizeKeyword = (value: string) =>
  cleanKeyword(value)
    .toLocaleLowerCase(["fa-IR", "en-US"]);

export const cleanTelegramCommand = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/^\/+/, "")
    .toLocaleLowerCase("en-US");

export const isValidTelegramCommand = (value: string) =>
  /^[a-z0-9_]{1,32}$/.test(cleanTelegramCommand(value));

export const toTelegramCommandKeyword = (value: string) => {
  const command = cleanTelegramCommand(value);
  return command ? `/${command}` : "";
};
