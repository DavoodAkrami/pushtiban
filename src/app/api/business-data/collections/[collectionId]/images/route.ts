import { NextResponse, type NextRequest } from "next/server";
import {
  getBusinessDataContext,
  getCollectionDetail,
  BusinessDataServiceError,
} from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readFormBody,
  readJsonBody,
} from "@/lib/business-data/route-utils";
import {
  removeBusinessDataImages,
  uploadBusinessDataImage,
} from "@/lib/business-data/image-storage";
import { businessDataImagePathBelongsTo } from "@/lib/business-data/image-values";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ collectionId: string }> };

export const POST = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    const collection = await getCollectionDetail(context, collectionId);
    if (collection.status === "archived") {
      throw new BusinessDataServiceError(
        "این مجموعه بایگانی شده است.",
        409,
        "collection_archived"
      );
    }
    if (!collection.fields.some((field) => field.type === "image")) {
      throw new BusinessDataServiceError(
        "برای این مجموعه فیلد تصویر تعریف نشده است.",
        409,
        "image_field_unavailable"
      );
    }
    const form = await readFormBody(request);
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new BusinessDataServiceError(
        "تصویر انتخاب نشده است.",
        400,
        "image_required"
      );
    }
    const path = await uploadBusinessDataImage({
      admin: context.admin,
      collectionId,
      file,
      userId: context.user.id,
    });
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const DELETE = async (
  request: NextRequest,
  { params }: RouteContext
) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    await getCollectionDetail(context, collectionId);
    const body = await readJsonBody(request);
    const path =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { path?: unknown }).path
        : null;
    if (
      typeof path !== "string" ||
      !businessDataImagePathBelongsTo({
        collectionId,
        path,
        userId: context.user.id,
      })
    ) {
      throw new BusinessDataServiceError(
        "مسیر تصویر معتبر نیست.",
        400,
        "invalid_image_path"
      );
    }
    const removed = await removeBusinessDataImages({
      admin: context.admin,
      collectionId,
      paths: [path],
      userId: context.user.id,
    });
    if (!removed) {
      throw new BusinessDataServiceError(
        "حذف تصویر انجام نشد؛ دوباره تلاش کنید.",
        503,
        "image_delete_failed"
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

