import { NextResponse, type NextRequest } from "next/server";
import {
  getBusinessDataContext,
  getCollectionDetail,
  updatePrivateAccessConfig,
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
    const collection = await getCollectionDetail(context, collectionId);
    return NextResponse.json({ privateAccess: collection.privateAccess });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json({
      collection: await updatePrivateAccessConfig(
        context,
        collectionId,
        await readJsonBody(request)
      ),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};
