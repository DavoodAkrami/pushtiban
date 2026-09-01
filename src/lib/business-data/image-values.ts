import { BUSINESS_DATA_LIMITS } from "./limits";

export const BUSINESS_DATA_IMAGE_BUCKET = "business-data-images";

export const BUSINESS_DATA_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const BUSINESS_DATA_IMAGE_ACCEPT =
  BUSINESS_DATA_IMAGE_MIME_TYPES.join(",");

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMAGE_NAME_PATTERN = "[0-9a-f-]{36}\\.(?:jpe?g|png|webp)";
const IMAGE_PATH_RE = new RegExp(
  `^${UUID_PATTERN}/${UUID_PATTERN}/${IMAGE_NAME_PATTERN}$`,
  "i"
);

export const isBusinessDataImagePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= BUSINESS_DATA_LIMITS.imagePathChars &&
  IMAGE_PATH_RE.test(value);

export const businessDataImagePathBelongsTo = ({
  collectionId,
  path,
  userId,
}: {
  collectionId: string;
  path: string;
  userId: string;
}) =>
  isBusinessDataImagePath(path) &&
  path.startsWith(`${userId}/${collectionId}/`);

export const businessDataImagePreviewUrl = (
  collectionId: string,
  path: string
) =>
  `/api/business-data/collections/${encodeURIComponent(collectionId)}/images/view?path=${encodeURIComponent(path)}`;

