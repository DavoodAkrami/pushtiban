import { NextResponse, type NextRequest } from "next/server";
import { getBusinessDataContext, getCollectionDetail } from "@/lib/business-data/server";
import {
  discoverSupabaseTables,
  getSupabaseConnectorPublicError,
  parseSupabaseApiKey,
  parseSupabaseProjectUrl,
  SupabaseConnectorError,
} from "@/lib/business-data/supabase-connector";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readJsonBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const context = await getBusinessDataContext();
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    if (typeof body.collectionId !== "string") {
      return NextResponse.json(
        { error: "مجموعه مشخص نیست.", code: "missing_collection" },
        { status: 400 }
      );
    }
    await getCollectionDetail(context, body.collectionId);
    const credentials = {
      projectUrl: parseSupabaseProjectUrl(body.projectUrl),
      apiKey: parseSupabaseApiKey(body.apiKey),
    };
    const tables = await discoverSupabaseTables(credentials);
    return NextResponse.json({
      message: "اتصال با موفقیت برقرار شد.",
      tables,
    });
  } catch (error) {
    if (error instanceof SupabaseConnectorError) {
      const publicError = getSupabaseConnectorPublicError(error);
      return NextResponse.json(
        { error: publicError.message, code: error.code },
        { status: publicError.status }
      );
    }
    return businessDataErrorResponse(error);
  }
};
