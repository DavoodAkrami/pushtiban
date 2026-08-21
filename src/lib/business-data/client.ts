import type { BusinessDataApiError } from "./api-types";

export class BusinessDataClientError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BusinessDataClientError";
    this.code = code;
  }
}

export const businessDataRequest = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(input, init);
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new BusinessDataClientError("پاسخ سرور قابل خواندن نیست.");
    }
  }
  if (!response.ok) {
    const error = (data ?? {}) as BusinessDataApiError;
    throw new BusinessDataClientError(
      error.error || "انجام درخواست ممکن نبود.",
      error.code
    );
  }
  return data as T;
};

export const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

