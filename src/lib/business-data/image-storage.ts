import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_DATA_IMAGE_BUCKET,
  businessDataImagePathBelongsTo,
} from "./image-values";
import { BUSINESS_DATA_LIMITS } from "./limits";
import { BusinessDataServiceError } from "./server";

type DetectedImage = {
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

const detectImage = (bytes: Uint8Array): DetectedImage | null => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return null;
};

export const uploadBusinessDataImage = async ({
  admin,
  collectionId,
  file,
  userId,
}: {
  admin: SupabaseClient;
  collectionId: string;
  file: File;
  userId: string;
}) => {
  if (file.size < 1 || file.size > BUSINESS_DATA_LIMITS.imageBytes) {
    throw new BusinessDataServiceError(
      "حجم هر تصویر باید کمتر از ۵ مگابایت باشد.",
      413,
      "image_too_large"
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected || file.type !== detected.mimeType) {
    throw new BusinessDataServiceError(
      "فقط تصویر JPEG، PNG یا WebP معتبر پذیرفته می‌شود.",
      400,
      "invalid_image"
    );
  }

  const path = `${userId}/${collectionId}/${randomUUID()}.${detected.extension}`;
  const { error } = await admin.storage
    .from(BUSINESS_DATA_IMAGE_BUCKET)
    .upload(path, bytes, {
      cacheControl: "3600",
      contentType: detected.mimeType,
      upsert: false,
    });
  if (error) {
    throw new BusinessDataServiceError(
      "بارگذاری تصویر انجام نشد؛ دوباره تلاش کنید.",
      503,
      "image_upload_failed"
    );
  }
  return path;
};

export const createBusinessDataImageSignedUrl = async ({
  admin,
  path,
  expiresIn = 300,
}: {
  admin: SupabaseClient;
  path: string;
  expiresIn?: number;
}) => {
  const { data, error } = await admin.storage
    .from(BUSINESS_DATA_IMAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

export const removeBusinessDataImages = async ({
  admin,
  collectionId,
  paths,
  userId,
}: {
  admin: SupabaseClient;
  collectionId: string;
  paths: string[];
  userId: string;
}) => {
  const ownedPaths = [...new Set(paths)].filter((path) =>
    businessDataImagePathBelongsTo({ collectionId, path, userId })
  );
  if (!ownedPaths.length) return true;
  const { error } = await admin.storage
    .from(BUSINESS_DATA_IMAGE_BUCKET)
    .remove(ownedPaths);
  return !error;
};

