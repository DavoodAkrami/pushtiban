import { NextResponse, type NextRequest } from "next/server";
import {
  deleteCollection,
  getBusinessDataContext,
  getCollectionDetail,
  updateCollection,
} from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readJsonBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ collectionId: string }> };

export const GET = async (_request: NextRequest, { params }: RouteContext) => {
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      collection: await getCollectionDetail(context, collectionId),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const PATCH = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      collection: await updateCollection(
        context,
        collectionId,
        await readJsonBody(request)
      ),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const DELETE = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const body = await readJsonBody(request);
    const confirmation =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).confirmation
        : undefined;
    const context = await getBusinessDataContext();
    await deleteCollection(context, collectionId, confirmation);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

