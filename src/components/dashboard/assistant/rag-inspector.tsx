"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fa } from "@/lib/utils";

// Lifted verbatim from the standalone /ai/rag-test playground, which had no
// dashboard shell and no link from anywhere in the product. It shows exactly
// what retrieval fed the model: the intent, the standing facts, the matched
// Q&A pairs and the KB chunks with their similarity scores.

export type RagIntentView = {
  category: string;
  confidence: number;
  searchQuery?: string | null;
  knowledgeNeeded?: boolean;
  businessDataRequested?: boolean;
  privateDataRequested?: boolean;
};
export type RagFactView = { id: string; category: string; factText: string };
export type RagQaView = {
  id: string;
  question: string;
  answer: string;
  category: string;
  similarity: number;
};
export type RagChunkView = {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  category?: string;
  similarity: number;
};
export type RagSourceView = { id: string; title: string };
export type BusinessDataRetrievalView = {
  collectionName: string;
  collectionKind: string;
  matchedCount: number;
  dataUpdatedAt: string | null;
  payloadChars: number;
  truncated: boolean;
  durationMs: number;
};

// ---- Retrieved context inline panel ----------------------------------------

type RagInspectorProps = {
  intent: RagIntentView | null;
  chunks: RagChunkView[];
  sources: RagSourceView[];
  facts: RagFactView[];
  qa: RagQaView[];
  businessData?: BusinessDataRetrievalView | null;
  embeddingsUnavailable?: boolean;
};

export const RagInspector = ({
  intent,
  chunks,
  sources,
  facts,
  qa,
  businessData,
  embeddingsUnavailable,
}: RagInspectorProps) => {
  const [expanded, setExpanded] = React.useState(false);
  const reduce = useReducedMotion() ?? false;
  const contentId = React.useId();

  const embeddingsNotice = embeddingsUnavailable ? (
    <div className="mb-3 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
      امبدینگ پیکربندی نشده؛ بازیابی از پایگاه دانش انجام نشد.
      {(facts.length > 0 || businessData) && (
        <span className="mt-1 block">
          دادهٔ ساختاریافته و اطلاعات ثابت کسب‌وکار همچنان قابل استفاده بودند.
        </span>
      )}
    </div>
  ) : null;

  if (!chunks.length && !facts.length && !qa.length && !businessData) {
    // Nothing matched — still show the intent and the rewritten search query
    // so the user can see WHAT was searched and debug why it found nothing.
    return (
      <>
        {embeddingsNotice}
        <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3 text-xs text-muted">
          <span className="flex items-center gap-2">
            <Database className="size-3.5 text-accent" aria-hidden />
            منبع مرتبطی برای این پاسخ پیدا نشد
          </span>
          {intent?.searchQuery && (
            <span className="mt-1.5 block text-[10px]">
              عبارت بررسی‌شده: {intent.searchQuery}
            </span>
          )}
        </div>
      </>
    );
  }

  const totalItems = chunks.length + facts.length + qa.length + (businessData ? 1 : 0);

  return (
    <>
      {embeddingsNotice}
      <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center justify-between text-start text-xs font-bold text-muted"
      >
        <span className="flex items-center gap-2">
          <Database className="size-3.5 text-accent" aria-hidden />
          منابع این پاسخ
          <Badge variant="muted" className="text-[10px]">
            {fa(totalItems)} مورد
          </Badge>
        </span>
        <span className="text-accent">
          {expanded ? "بستن" : "بررسی منابع"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                {businessData && (
                  <Badge variant="accent">دادهٔ زندهٔ کسب‌وکار</Badge>
                )}
                {facts.length > 0 && (
                  <Badge variant="muted">اطلاعات ثابت</Badge>
                )}
                {qa.length > 0 && (
                  <Badge variant="muted">پرسش و پاسخ آماده</Badge>
                )}
                {chunks.length > 0 && (
                  <Badge variant="muted">منابع دانش</Badge>
                )}
              </div>
              {intent && (intent.category !== "general" || intent.searchQuery) && (
                <div className="rounded-xl border border-line bg-surface/50 p-2 text-[10px] leading-5 text-muted">
                  <span className="font-bold text-foreground">جزئیات جستجو</span>
                  {intent.category !== "general" && (
                    <span className="ms-2">
                      موضوع: {intent.category} · اطمینان {fa(intent.confidence.toFixed(2))}
                    </span>
                  )}
                  {intent.searchQuery && (
                    <span className="mt-1 block">عبارت: {intent.searchQuery}</span>
                  )}
                </div>
              )}
              {businessData && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    دادهٔ ساختاریافته
                  </p>
                  <div className="rounded-xl border border-line bg-surface/50 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold">{businessData.collectionName}</span>
                      <Badge variant="accent" className="text-[10px]">
                        {fa(businessData.matchedCount)} نتیجه
                      </Badge>
                      {businessData.truncated && (
                        <Badge variant="warning" className="text-[10px]">
                          خروجی محدود شده
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 leading-6 text-muted">
                      {businessData.dataUpdatedAt
                        ? `تازه‌ترین داده: ${new Date(businessData.dataUpdatedAt).toLocaleString("fa-IR")}`
                        : "زمان به‌روزرسانی ثبت نشده"}
                      {` · ${fa(businessData.payloadChars)} نویسه · ${fa(businessData.durationMs)} میلی‌ثانیه`}
                    </p>
                  </div>
                </div>
              )}
              {/* Standing facts */}
              {facts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    اطلاعات کسب‌وکار ({fa(facts.length)})
                  </p>
                  <div className="space-y-1.5">
                    {facts.map((fact, i) => (
                      <div
                        key={fact.id}
                        className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                      >
                        <Badge variant="muted" className="mb-1 text-[10px]">
                          {fact.category}
                        </Badge>
                        <p className="whitespace-pre-wrap text-muted">
                          [F{fa(i + 1)}] {fact.factText}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Curated Q&A */}
              {qa.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    پرسش و پاسخ آماده ({fa(qa.length)})
                  </p>
                  <div className="space-y-1.5">
                    {qa.map((pair, i) => (
                      <div
                        key={pair.id}
                        className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="muted" className="text-[10px]">
                            {pair.category}
                          </Badge>
                          <Badge variant="muted" className="text-[10px]">
                            شباهت: {fa(pair.similarity.toFixed(3))}
                          </Badge>
                        </div>
                        <p className="font-bold">[Q{fa(i + 1)}] {pair.question}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-muted">
                          {pair.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vector-retrieved chunks */}
              {chunks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    بخش‌های بازیابی‌شده ({fa(chunks.length)})
                  </p>
                  <div className="space-y-1.5">
                    {chunks.map((chunk, index) => {
                      const sourceMeta = sources.find(
                        (s) => s.id === chunk.sourceId
                      );
                      return (
                        <div
                          key={chunk.id}
                          className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-bold text-accent">
                              [{fa(index + 1)}]
                            </span>
                            <div className="flex gap-1">
                              {chunk.category && (
                                <Badge variant="muted" className="text-[10px]">
                                  {chunk.category}
                                </Badge>
                              )}
                              <Badge variant="muted" className="text-[10px]">
                                شباهت: {fa(chunk.similarity.toFixed(3))}
                              </Badge>
                            </div>
                          </div>
                          {sourceMeta && (
                            <p className="mb-1 text-[10px] text-muted">
                              منبع: {sourceMeta.title} · بخش{" "}
                              {fa(chunk.chunkIndex + 1)}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-muted">
                            {chunk.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
};
