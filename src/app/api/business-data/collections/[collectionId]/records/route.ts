import { NextResponse, type NextRequest } from "next/server";
import { isBusinessDataRecordStatus } from "@/lib/business-data/types";
import {
  createRecord,
  getBusinessDataContext,
  listRecords,
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

export const GET = async (request: NextRequest, { params }: RouteContext) => {
  try {
    const { collectionId } = await params;
    const search = request.nextUrl.searchParams;
    const rawStatus = search.get("status") ?? "active";
    const status =
      rawStatus === "all" || isBusinessDataRecordStatus(rawStatus)
        ? rawStatus
        : "active";
    const rawSort = search.get("sort");
    const sort =
      rawSort === "updated_asc" || rawSort === "created_desc"
        ? rawSort
        : "updated_desc";
    const context = await getBusinessDataContext();
    return NextResponse.json({
      page: await listRecords(context, collectionId, {
        page: Number(search.get("page") ?? 1),
        pageSize: Number(search.get("pageSize") ?? 20),
        query: search.get("q") ?? "",
        status,
        sort,
      }),
    });
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

export const POST = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const { collectionId } = await params;
    const context = await getBusinessDataContext();
    return NextResponse.json(
      {
        record: await createRecord(
          context,
          collectionId,
          await readJsonBody(request)
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    return businessDataErrorResponse(error);
  }
};

