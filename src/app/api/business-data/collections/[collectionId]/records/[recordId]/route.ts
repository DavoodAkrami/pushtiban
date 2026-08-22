import { NextResponse, type NextRequest } from "next/server";
import {
  deleteRecord,
  getBusinessDataContext,
  getRecord,
  updateRecord,
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
  params: Promise<{ collectionId: string; recordId: string }>;
};

export const GET = async (_request: NextRequest, { params }: RouteContext) => {
  try {
    const { collectionId, recordId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      record: await getRecord(context, collectionId, recordId),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const PATCH = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId, recordId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      record: await updateRecord(
        context,
        collectionId,
        recordId,
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
    const { collectionId, recordId } = await params;
    const context = await getBusinessDataContext();
    await deleteRecord(context, collectionId, recordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

