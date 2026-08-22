import { NextResponse, type NextRequest } from "next/server";
import {
  deleteField,
  getBusinessDataContext,
  moveField,
  updateField,
} from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readJsonBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ collectionId: string; fieldId: string }>;
};

export const PATCH = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId, fieldId } = await params;
    const body = await readJsonBody(request);
    const context = await getBusinessDataContext();
    const move =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).move
        : undefined;
    const collection =
      move === -1 || move === 1
        ? await moveField(context, collectionId, fieldId, move)
        : await updateField(context, collectionId, fieldId, body);
    return NextResponse.json({ collection });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const DELETE = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId, fieldId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      collection: await deleteField(context, collectionId, fieldId),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

