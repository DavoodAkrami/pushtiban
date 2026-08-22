import { NextResponse, type NextRequest } from "next/server";
import {
  BusinessDataIngestionError,
  parseFileForPreview,
} from "@/lib/business-data/ingestion";
import {
  getBusinessDataContext,
  importIngestion,
  importNewCollectionIngestion,
} from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  parseFormJson,
  readFormBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const context = await getBusinessDataContext();
    const form = await readFormBody(request);
    const file = form.get("file");
    const collectionId = form.get("collectionId");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "فایل CSV یا Excel را انتخاب کنید.", code: "missing_input" }, { status: 400 });
    }
    const preview = await parseFileForPreview(file, typeof form.get("sheetName") === "string" ? String(form.get("sheetName")) : null);
    const shared = {
      preview,
      mapping: parseFormJson(form.get("mapping"), "تطبیق ستون‌ها"),
      newFields: form.has("newFields")
        ? parseFormJson(form.get("newFields"), "فیلدهای جدید")
        : [],
      externalIdField: form.get("externalIdField"),
      idempotencyKey: form.get("idempotencyKey"),
    };
    const result = typeof collectionId === "string"
      ? await importIngestion(context, { collectionId, ...shared })
      : await importNewCollectionIngestion(context, {
          definition: parseFormJson(form.get("collectionDefinition"), "اطلاعات مجموعه"),
          ...shared,
        });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof BusinessDataIngestionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return businessDataErrorResponse(error);
  }
};
