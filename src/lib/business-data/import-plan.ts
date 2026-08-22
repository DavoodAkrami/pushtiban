import type {
  BusinessDataFieldDefinition,
} from "./types";
import type { IngestionMapping } from "./ingestion";

/**
 * Keep the import payload aligned with the mapping and the authoritative
 * collection schema. A field that already exists is never a proposed field,
 * even if an older client included it in the preview response.
 */
export const selectProposedImportFields = (
  fields: BusinessDataFieldDefinition[],
  mapping: IngestionMapping,
  existingFields: BusinessDataFieldDefinition[] = []
) => {
  const mappedKeys = new Set(
    Object.values(mapping).filter((value): value is string => typeof value === "string")
  );
  const existingKeys = new Set(existingFields.map((field) => field.key));
  return fields.filter((field) => mappedKeys.has(field.key) && !existingKeys.has(field.key));
};

export const findConflictingProposedImportFields = (
  fields: BusinessDataFieldDefinition[],
  mapping: IngestionMapping,
  existingFields: BusinessDataFieldDefinition[]
) => {
  const mappedKeys = new Set(
    Object.values(mapping).filter((value): value is string => typeof value === "string")
  );
  const existingKeys = new Set(existingFields.map((field) => field.key));
  return fields.filter((field) => existingKeys.has(field.key) && !mappedKeys.has(field.key));
};

/**
 * Produce deterministic positions for proposed fields. The database repeats
 * this calculation inside the import transaction; this keeps the request
 * payload predictable without treating browser positions as authoritative.
 */
export const appendImportFieldPositions = <T extends BusinessDataFieldDefinition>(
  existingFields: BusinessDataFieldDefinition[],
  proposedFields: T[]
) => {
  const nextPosition = Math.max(-1, ...existingFields.map((field) => field.position)) + 1;
  return proposedFields.map((field, index) => ({
    ...field,
    position: nextPosition + index,
  }));
};
