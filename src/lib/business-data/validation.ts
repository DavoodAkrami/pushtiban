import { BUSINESS_DATA_LIMITS } from "./limits";
import {
  isBusinessDataAccessScope,
  isBusinessDataAiExposure,
  isBusinessDataCollectionKind,
  isBusinessDataCollectionStatus,
  isBusinessDataFieldRole,
  isBusinessDataFieldType,
  type BusinessDataCollectionDefinition,
  type BusinessDataFieldDefinition,
  type BusinessDataFieldValidation,
  type BusinessDataRecordValues,
  type BusinessDataScalar,
  type BusinessDataValidationIssue,
  type BusinessDataValidationResult,
} from "./types";

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizedText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ");

export const normalizeCollectionName = (value: string) =>
  normalizedText(value);

export const normalizeCollectionDescription = (value: string) =>
  value.normalize("NFKC").trim();

export const normalizeFieldKey = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeExternalId = (value: string) =>
  value.normalize("NFKC").trim();

const serializedBytes = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export const jsonDepth = (value: unknown, currentDepth = 0): number => {
  if (value === null || typeof value !== "object") return currentDepth;
  const children = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.values(value)
      : [];
  if (children.length === 0) return currentDepth + 1;
  return Math.max(
    ...children.map((child) => jsonDepth(child, currentDepth + 1))
  );
};

const issue = (
  code: BusinessDataValidationIssue["code"],
  path: string,
  message: string
): BusinessDataValidationIssue => ({ code, path, message });

const optionalInteger = (
  value: unknown,
  path: string,
  min: number,
  max: number,
  issues: BusinessDataValidationIssue[]
): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.push(issue("invalid_value", path, `Expected an integer from ${min} to ${max}.`));
    return undefined;
  }
  return value as number;
};

const optionalNumber = (
  value: unknown,
  path: string,
  issues: BusinessDataValidationIssue[]
): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue("invalid_value", path, "Expected a finite number."));
    return undefined;
  }
  return value;
};

const parseFieldValidation = (
  value: unknown,
  fieldType: BusinessDataFieldDefinition["type"],
  path: string,
  issues: BusinessDataValidationIssue[]
): BusinessDataFieldValidation | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    issues.push(issue("invalid_type", path, "Validation must be an object."));
    return undefined;
  }

  const knownKeys = new Set([
    "minLength",
    "maxLength",
    "min",
    "max",
    "decimalPlaces",
    "options",
  ]);
  for (const key of Object.keys(value)) {
    if (!knownKeys.has(key)) {
      issues.push(
        issue("invalid_value", `${path}.${key}`, "Unknown validation rule.")
      );
    }
  }

  const supportsLength = ["text", "long_text", "select", "url"].includes(
    fieldType
  );
  const supportsRange = ["number", "currency"].includes(fieldType);
  if (
    !supportsLength &&
    (value.minLength !== undefined || value.maxLength !== undefined)
  ) {
    issues.push(
      issue("invalid_value", path, "Length rules require a string field.")
    );
  }
  if (
    !supportsRange &&
    (value.min !== undefined ||
      value.max !== undefined ||
      value.decimalPlaces !== undefined)
  ) {
    issues.push(
      issue(
        "invalid_value",
        path,
        "Numeric rules require a number or currency field."
      )
    );
  }

  const validation: BusinessDataFieldValidation = {};
  validation.minLength = optionalInteger(
    value.minLength,
    `${path}.minLength`,
    0,
    BUSINESS_DATA_LIMITS.longTextValueChars,
    issues
  );
  validation.maxLength = optionalInteger(
    value.maxLength,
    `${path}.maxLength`,
    1,
    BUSINESS_DATA_LIMITS.longTextValueChars,
    issues
  );
  validation.min = optionalNumber(value.min, `${path}.min`, issues);
  validation.max = optionalNumber(value.max, `${path}.max`, issues);
  validation.decimalPlaces = optionalInteger(
    value.decimalPlaces,
    `${path}.decimalPlaces`,
    0,
    8,
    issues
  );

  if (value.options !== undefined) {
    if (fieldType !== "select" || !Array.isArray(value.options)) {
      issues.push(
        issue(
          "invalid_type",
          `${path}.options`,
          "Options are allowed only for select fields."
        )
      );
    } else if (value.options.length > BUSINESS_DATA_LIMITS.selectOptions) {
      issues.push(
        issue("limit_exceeded", `${path}.options`, "Too many select options.")
      );
    } else {
      const options = value.options
        .filter((option): option is string => typeof option === "string")
        .map(normalizedText);
      if (
        options.length !== value.options.length ||
        options.some(
          (option) =>
            !option || option.length > BUSINESS_DATA_LIMITS.selectOptionChars
        ) ||
        new Set(options).size !== options.length
      ) {
        issues.push(
          issue(
            "invalid_value",
            `${path}.options`,
            "Select options must be unique, non-empty bounded strings."
          )
        );
      } else {
        validation.options = options;
      }
    }
  }

  if (
    validation.minLength !== undefined &&
    validation.maxLength !== undefined &&
    validation.minLength > validation.maxLength
  ) {
    issues.push(
      issue("invalid_value", path, "Minimum length exceeds maximum length.")
    );
  }
  if (
    validation.min !== undefined &&
    validation.max !== undefined &&
    validation.min > validation.max
  ) {
    issues.push(issue("invalid_value", path, "Minimum exceeds maximum."));
  }
  if (fieldType === "select" && !validation.options?.length) {
    issues.push(
      issue("required", `${path}.options`, "Select fields require options.")
    );
  }

  return validation;
};

const parseField = (
  value: unknown,
  position: number,
  issues: BusinessDataValidationIssue[]
): BusinessDataFieldDefinition | null => {
  const path = `fields.${position}`;
  if (!isPlainObject(value)) {
    issues.push(issue("invalid_type", path, "Field must be an object."));
    return null;
  }

  const key = typeof value.key === "string" ? normalizeFieldKey(value.key) : "";
  const label = typeof value.label === "string" ? normalizedText(value.label) : "";
  const description =
    typeof value.description === "string"
      ? value.description.normalize("NFKC").trim()
      : undefined;

  if (!key || !FIELD_KEY_PATTERN.test(key)) {
    issues.push(issue("invalid_value", `${path}.key`, "Invalid field key."));
  }
  if (!label || label.length > BUSINESS_DATA_LIMITS.fieldLabelChars) {
    issues.push(issue("invalid_value", `${path}.label`, "Invalid field label."));
  }
  if (
    description !== undefined &&
    description.length > BUSINESS_DATA_LIMITS.fieldDescriptionChars
  ) {
    issues.push(
      issue("invalid_value", `${path}.description`, "Field description is too long.")
    );
  }
  if (!isBusinessDataFieldType(value.type)) {
    issues.push(issue("invalid_value", `${path}.type`, "Invalid field type."));
  }
  if (!isBusinessDataFieldRole(value.role)) {
    issues.push(issue("invalid_value", `${path}.role`, "Invalid field role."));
  }
  if (!isBusinessDataAiExposure(value.aiExposure)) {
    issues.push(
      issue("invalid_value", `${path}.aiExposure`, "Invalid AI exposure.")
    );
  }
  for (const property of ["required", "searchable", "filterable"] as const) {
    if (typeof value[property] !== "boolean") {
      issues.push(
        issue("invalid_type", `${path}.${property}`, "Expected a boolean.")
      );
    }
  }

  if (
    !key ||
    !label ||
    !isBusinessDataFieldType(value.type) ||
    !isBusinessDataFieldRole(value.role) ||
    !isBusinessDataAiExposure(value.aiExposure) ||
    typeof value.required !== "boolean" ||
    typeof value.searchable !== "boolean" ||
    typeof value.filterable !== "boolean"
  ) {
    return null;
  }

  const validation = parseFieldValidation(
    value.validation,
    value.type,
    `${path}.validation`,
    issues
  );

  return {
    key,
    label,
    ...(description ? { description } : {}),
    type: value.type,
    role: value.role,
    required: value.required,
    searchable: value.searchable,
    filterable: value.filterable,
    aiExposure: value.aiExposure,
    position,
    ...(validation ? { validation } : {}),
  };
};

export const validateFieldDefinitions = (
  value: unknown
): BusinessDataValidationResult<BusinessDataFieldDefinition[]> => {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      issues: [issue("invalid_type", "fields", "Fields must be an array.")],
    };
  }
  if (value.length === 0 || value.length > BUSINESS_DATA_LIMITS.fieldsPerCollection) {
    return {
      ok: false,
      issues: [
        issue(
          "limit_exceeded",
          "fields",
          `Collections require 1 to ${BUSINESS_DATA_LIMITS.fieldsPerCollection} fields.`
        ),
      ],
    };
  }

  const issues: BusinessDataValidationIssue[] = [];
  const fields = value
    .map((field, position) => parseField(field, position, issues))
    .filter((field): field is BusinessDataFieldDefinition => field !== null);
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) {
      issues.push(
        issue("duplicate_field", `fields.${field.key}`, "Duplicate field key.")
      );
    }
    seen.add(field.key);
  }
  if (fields.filter((field) => field.role === "title").length !== 1) {
    issues.push(
      issue("invalid_value", "fields", "Exactly one title field is required.")
    );
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: fields };
};

export const validateCollectionDefinition = (
  value: unknown
): BusinessDataValidationResult<BusinessDataCollectionDefinition> => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [issue("invalid_type", "collection", "Collection must be an object.")],
    };
  }

  const issues: BusinessDataValidationIssue[] = [];
  const name =
    typeof value.name === "string" ? normalizeCollectionName(value.name) : "";
  const description =
    typeof value.description === "string"
      ? normalizeCollectionDescription(value.description)
      : "";
  if (!name) issues.push(issue("required", "name", "Collection name is required."));
  if (name.length > BUSINESS_DATA_LIMITS.collectionNameChars) {
    issues.push(issue("invalid_value", "name", "Collection name is too long."));
  }
  if (description.length > BUSINESS_DATA_LIMITS.collectionDescriptionChars) {
    issues.push(
      issue("invalid_value", "description", "Collection description is too long.")
    );
  }
  if (!isBusinessDataCollectionKind(value.kind)) {
    issues.push(issue("invalid_value", "kind", "Invalid collection kind."));
  }
  if (!isBusinessDataAccessScope(value.accessScope)) {
    issues.push(issue("invalid_value", "accessScope", "Invalid access scope."));
  }
  if (!isBusinessDataCollectionStatus(value.status)) {
    issues.push(issue("invalid_value", "status", "Invalid collection status."));
  }
  if (typeof value.aiEnabled !== "boolean") {
    issues.push(issue("invalid_type", "aiEnabled", "Expected a boolean."));
  }
  const fieldsResult = validateFieldDefinitions(value.fields);
  if (fieldsResult.ok === false) issues.push(...fieldsResult.issues);

  if (
    !name ||
    !isBusinessDataCollectionKind(value.kind) ||
    !isBusinessDataAccessScope(value.accessScope) ||
    !isBusinessDataCollectionStatus(value.status) ||
    typeof value.aiEnabled !== "boolean" ||
    !fieldsResult.ok
  ) {
    return { ok: false, issues };
  }
  if (value.accessScope === "internal" && value.aiEnabled) {
    issues.push(
      issue(
        "invalid_value",
        "aiEnabled",
        "Internal collections cannot enable AI access."
      )
    );
  }

  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          name,
          description,
          kind: value.kind,
          accessScope: value.accessScope,
          status: value.status,
          aiEnabled: value.aiEnabled,
          fields: fieldsResult.value,
        },
      };
};

const isValidDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const normalizeScalar = (
  field: BusinessDataFieldDefinition,
  value: unknown,
  issues: BusinessDataValidationIssue[]
): BusinessDataScalar | undefined => {
  const path = `values.${field.key}`;
  if (value === null || value === undefined || value === "") {
    if (field.required) issues.push(issue("required", path, "Value is required."));
    return value === undefined ? undefined : null;
  }

  if (field.type === "text" || field.type === "long_text" || field.type === "select" || field.type === "url") {
    if (typeof value !== "string") {
      issues.push(issue("invalid_type", path, "Expected a string."));
      return undefined;
    }
    const normalized = field.type === "long_text" ? value.normalize("NFKC").trim() : normalizedText(value);
    const defaultMax =
      field.type === "long_text"
        ? BUSINESS_DATA_LIMITS.longTextValueChars
        : field.type === "url"
          ? BUSINESS_DATA_LIMITS.urlValueChars
          : BUSINESS_DATA_LIMITS.textValueChars;
    const minLength = field.validation?.minLength ?? (field.required ? 1 : 0);
    const maxLength = Math.min(field.validation?.maxLength ?? defaultMax, defaultMax);
    if (normalized.length < minLength || normalized.length > maxLength) {
      issues.push(issue("invalid_value", path, "String length is outside the allowed range."));
      return undefined;
    }
    if (field.type === "select" && !field.validation?.options?.includes(normalized)) {
      issues.push(issue("invalid_value", path, "Value is not an allowed option."));
      return undefined;
    }
    if (field.type === "url") {
      try {
        const url = new URL(normalized);
        if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
          throw new Error("Unsafe URL");
        }
        return url.toString();
      } catch {
        issues.push(issue("invalid_value", path, "Expected an HTTP(S) URL without credentials."));
        return undefined;
      }
    }
    return normalized;
  }

  if (field.type === "number" || field.type === "currency") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(issue("invalid_type", path, "Expected a finite number."));
      return undefined;
    }
    if (
      (field.validation?.min !== undefined && value < field.validation.min) ||
      (field.validation?.max !== undefined && value > field.validation.max)
    ) {
      issues.push(issue("invalid_value", path, "Number is outside the allowed range."));
      return undefined;
    }
    const decimalPlaces = field.validation?.decimalPlaces;
    if (decimalPlaces !== undefined) {
      const scaled = value * 10 ** decimalPlaces;
      if (Math.abs(scaled - Math.round(scaled)) > Number.EPSILON * Math.abs(scaled)) {
        issues.push(issue("invalid_value", path, "Number has too many decimal places."));
        return undefined;
      }
    }
    return value;
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      issues.push(issue("invalid_type", path, "Expected a boolean."));
      return undefined;
    }
    return value;
  }

  if (field.type === "date") {
    if (typeof value !== "string" || !isValidDate(value)) {
      issues.push(issue("invalid_value", path, "Expected a valid YYYY-MM-DD date."));
      return undefined;
    }
    return value;
  }

  if (typeof value !== "string" || !DATETIME_PATTERN.test(value)) {
    issues.push(issue("invalid_value", path, "Expected an ISO datetime with a timezone."));
    return undefined;
  }
  const datetime = new Date(value);
  if (Number.isNaN(datetime.getTime())) {
    issues.push(issue("invalid_value", path, "Expected a valid datetime."));
    return undefined;
  }
  return datetime.toISOString();
};

export const validateRecordValues = (
  value: unknown,
  fields: readonly BusinessDataFieldDefinition[]
): BusinessDataValidationResult<BusinessDataRecordValues> => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [issue("invalid_type", "values", "Record values must be an object.")],
    };
  }
  if (jsonDepth(value) > BUSINESS_DATA_LIMITS.jsonDepth) {
    return {
      ok: false,
      issues: [issue("limit_exceeded", "values", "Record nesting is too deep.")],
    };
  }
  if (serializedBytes(value) > BUSINESS_DATA_LIMITS.recordBytes) {
    return {
      ok: false,
      issues: [issue("too_large", "values", "Serialized record is too large.")],
    };
  }

  const issues: BusinessDataValidationIssue[] = [];
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const key of Object.keys(value)) {
    if (!byKey.has(key)) {
      issues.push(issue("unknown_field", `values.${key}`, "Unknown field."));
    }
  }

  const normalized: BusinessDataRecordValues = {};
  for (const field of fields) {
    const fieldValue = normalizeScalar(field, value[field.key], issues);
    if (fieldValue !== undefined) normalized[field.key] = fieldValue;
  }
  if (serializedBytes(normalized) > BUSINESS_DATA_LIMITS.recordBytes) {
    issues.push(issue("too_large", "values", "Normalized record is too large."));
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: normalized };
};

export const selectAiAnswerValues = (
  values: BusinessDataRecordValues,
  fields: readonly BusinessDataFieldDefinition[]
): BusinessDataRecordValues => {
  const answerKeys = new Set(
    fields
      .filter((field) => field.aiExposure === "answer")
      .map((field) => field.key)
  );
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => answerKeys.has(key))
  );
};
