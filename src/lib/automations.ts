export const KEYWORD_MAX_LENGTH = 80;
export const REPLY_MAX_LENGTH = 4096;

export type KeywordAutomation = {
  id: string;
  keyword: string;
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
