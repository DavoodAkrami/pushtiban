"use client";

import * as React from "react";
import type { BusinessDataCollectionDetail } from "@/lib/business-data/api-types";
import { businessDataRequest } from "@/lib/business-data/client";

export const useBusinessDataCollection = (collectionId: string) => {
  const [collection, setCollection] =
    React.useState<BusinessDataCollectionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await businessDataRequest<{
        collection: BusinessDataCollectionDetail;
      }>(`/api/business-data/collections/${collectionId}`);
      setCollection(data.collection);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "مجموعه بارگذاری نشد."
      );
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  return { collection, setCollection, loading, error, reload };
};
