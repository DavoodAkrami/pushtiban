import { NextResponse, type NextRequest } from "next/server";
import { createCollection, getBusinessDataContext, listCollections } from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readJsonBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async () => {
  try {
    const context = await getBusinessDataContext();
    const [collections, profileResult] = await Promise.all([
      listCollections(context),
      context.admin
        .from("profiles")
        .select("business_category")
        .eq("id", context.user.id)
        .maybeSingle(),
    ]);
    return NextResponse.json({
      collections,
      businessCategory:
        typeof profileResult.data?.business_category === "string"
          ? profileResult.data.business_category
          : "other",
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const POST = async (request: NextRequest) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const context = await getBusinessDataContext();
    const collection = await createCollection(context, await readJsonBody(request));
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

