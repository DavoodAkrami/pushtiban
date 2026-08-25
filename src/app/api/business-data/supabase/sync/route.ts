import { NextResponse, type NextRequest } from "next/server";
import { getBusinessDataContext } from "@/lib/business-data/server";
import { syncSupabaseConnection } from "@/lib/business-data/supabase-sync";
import {
  getSupabaseConnectorPublicError,
  SupabaseConnectorError,
} from "@/lib/business-data/supabase-connector";
import { BusinessDataIngestionError } from "@/lib/business-data/ingestion";
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
    const result = await syncSupabaseConnection(context, {
      collectionId: body.collectionId,
      mapping: body.mapping,
      newFields: body.newFields,
      externalIdField: body.externalIdField,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof SupabaseConnectorError) {
      const publicError = getSupabaseConnectorPublicError(error);
      return NextResponse.json(
        { error: publicError.message, code: error.code },
        { status: publicError.status }
      );
    }
    if (error instanceof BusinessDataIngestionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    return businessDataErrorResponse(error);
  }
};
