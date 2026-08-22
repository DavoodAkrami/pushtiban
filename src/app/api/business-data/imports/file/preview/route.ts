import { NextResponse, type NextRequest } from "next/server";
import {
  BusinessDataIngestionError,
  buildImportPreview,
  parseFileForPreview,
  resolveIngestionTitle,
  suggestedFieldDefinitions,
  suggestedMapping,
} from "@/lib/business-data/ingestion";
import type { BusinessDataFieldDefinition } from "@/lib/business-data/types";
import { getBusinessDataContext, getCollectionDetail } from "@/lib/business-data/server";
import {
  businessDataErrorResponse,
  hasValidBusinessDataOrigin,
  invalidOriginResponse,
  readFormBody,
} from "@/lib/business-data/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest) => {
  if (!hasValidBusinessDataOrigin(request)) return invalidOriginResponse();
  try {
    const context = await getBusinessDataContext();
    const form = await readFormBody(request);
    const file = form.get("file");
    const collectionId = form.get("collectionId");
    const sheetName = form.get("sheetName");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "فایل CSV یا Excel را انتخاب کنید.", code: "missing_input" }, { status: 400 });
    }
    const preview = await parseFileForPreview(file, typeof sheetName === "string" ? sheetName : null);
    const collection = typeof collectionId === "string"
      ? await getCollectionDetail(context, collectionId)
      : null;
    const existingTitle = collection?.fields.find((field) => field.role === "title") ?? null;
    const titleResolution = resolveIngestionTitle(
      preview,
      suggestedFieldDefinitions(preview, { fallbackTitle: false }),
      existingTitle?.key
    );
    const fields = collection?.fields ?? titleResolution.fields;
    const mapping = suggestedMapping(preview, fields);
    const newFields: BusinessDataFieldDefinition[] = [];
    if (collection) {
      const suggested = titleResolution.fields;
      const usedKeys = new Set(fields.map((field) => field.key));
      for (const column of preview.columns) {
        if (mapping[column.key]) continue;
        const candidate = suggested.find((field) => field.key === column.key);
        if (!candidate) continue;
        let key = candidate.key;
        let suffix = 2;
        while (usedKeys.has(key)) {
          key = `${candidate.key}_${suffix}`;
          suffix += 1;
        }
        const definition = { ...candidate, key, position: fields.length + newFields.length };
        newFields.push(definition);
        usedKeys.add(key);
        mapping[column.key] = key;
      }
    }
    const importFields = collection ? [...fields, ...newFields] : fields;
    const identifier = preview.columns.find((column) => column.uniqueCandidate);
    const result = buildImportPreview(preview, importFields, mapping, identifier ? mapping[identifier.key] ?? null : null);
    return NextResponse.json({
      preview: {
        sourceType: result.sourceType,
        sourceName: result.sourceName,
        sheetName: result.sheetName,
        sheetNames: result.sheetNames,
        columns: result.columns,
        sampleRows: result.sampleRows,
        rowCount: result.rows.length,
        warnings: result.warnings,
        validCount: result.validCount,
        rejectedCount: result.rejectedCount,
        rejectedRows: result.rejectedRows,
        hasStableIdentifier: result.hasStableIdentifier,
      },
      fields: collection ? fields : [],
      newFields: collection ? newFields : fields,
      mapping,
      externalIdField: identifier ? mapping[identifier.key] ?? null : null,
      titleFieldKey: titleResolution.titleKey,
      titleCandidateKeys: titleResolution.candidateKeys,
      titleSelectionRequired: collection ? false : titleResolution.requiresSelection,
    });
  } catch (error) {
    if (error instanceof BusinessDataIngestionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return businessDataErrorResponse(error);
  }
};
