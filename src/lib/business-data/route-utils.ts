import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { BusinessDataServiceError } from "./server";

export const hasValidBusinessDataOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const businessDataErrorResponse = (error: unknown) => {
  if (error instanceof BusinessDataServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { error: "انجام درخواست ممکن نبود؛ دوباره تلاش کنید.", code: "unexpected" },
    { status: 500 }
  );
};

export const invalidOriginResponse = () =>
  NextResponse.json(
    { error: "درخواست معتبر نیست؛ صفحه را تازه کنید.", code: "invalid_origin" },
    { status: 403 }
  );

export const readJsonBody = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new BusinessDataServiceError(
      "اطلاعات قابل خواندن نیست.",
      400,
      "invalid_json"
    );
  }
};

export const readFormBody = async (request: NextRequest) => {
  try {
    return await request.formData();
  } catch {
    throw new BusinessDataServiceError(
      "فایل یا اطلاعات فرم قابل خواندن نیست.",
      400,
      "invalid_form"
    );
  }
};

export const parseFormJson = (value: FormDataEntryValue | null, field: string): unknown => {
  if (typeof value !== "string") {
    throw new BusinessDataServiceError(`${field} قابل خواندن نیست.`, 400, "invalid_form");
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BusinessDataServiceError(`${field} معتبر نیست.`, 400, "invalid_form");
  }
};
