import { NextResponse, type NextRequest } from "next/server";
import {
  businessDataErrorResponse,
} from "@/lib/business-data/route-utils";
import {
  getBusinessDataContext,
  getCollectionDetail,
  BusinessDataServiceError,
} from "@/lib/business-data/server";
import { businessDataImagePathBelongsTo } from "@/lib/business-data/image-values";
import { createBusinessDataImageSignedUrl } from "@/lib/business-data/image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ collectionId: string }> };

export const GET = async (request: NextRequest, { params }: RouteContext) => {
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    await getCollectionDetail(context, collectionId);
    const path = request.nextUrl.searchParams.get("path");
    if (
      !path ||
      !businessDataImagePathBelongsTo({
        collectionId,
        path,
        userId: context.user.id,
      })
    ) {
      throw new BusinessDataServiceError(
        "تصویر پیدا نشد.",
        404,
        "not_found"
      );
    }
    const signedUrl = await createBusinessDataImageSignedUrl({
      admin: context.admin,
      path,
    });
    if (!signedUrl) {
      throw new BusinessDataServiceError(
        "تصویر پیدا نشد.",
        404,
        "not_found"
      );
    }
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

