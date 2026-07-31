"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Database, FileText, HelpCircle, Search } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { cn, fa } from "@/lib/utils";

// Lifted verbatim from the standalone /ai/rag-test playground, which had no
// dashboard shell and no link from anywhere in the product. It shows exactly
// what retrieval fed the model: the intent, the standing facts, the matched
// Q&A pairs and the KB chunks with their similarity scores.

export type RagIntentView = {
  category: string;
  confidence: number;
  searchQuery?: string | null;
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

// ---- Retrieved context inline panel ----------------------------------------

type RagInspectorProps = {
  intent: RagIntentView | null;
  chunks: RagChunkView[];
  sources: RagSourceView[];
  facts: RagFactView[];
  qa: RagQaView[];
  embeddingsUnavailable?: boolean;
};

export const RagInspector = ({
  intent,
  chunks,
  sources,
  facts,
  qa,
  embeddingsUnavailable,
}: RagInspectorProps) => {
  const [expanded, setExpanded] = React.useState(false);
  const reduce = useReducedMotion() ?? false;

  if (embeddingsUnavailable) {
    return (
      <div className="mb-3 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        امبدینگ پیکربندی نشده؛ پاسخ بدون بازیابی از پایگاه دانش است.
        {(facts.length > 0 || qa.length > 0) && (
          <span className="mt-1 block">
            اطلاعات کسب‌وکار و پرسش آماده همچنان تزریق شدند.
          </span>
        )}
      </div>
    );
  }

  if (!chunks.length && !facts.length && !qa.length) {
    // Nothing matched — still show the intent and the rewritten search query
    // so the user can see WHAT was searched and debug why it found nothing.
    return (
      <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-2">
          <Database className="size-3.5 text-accent" />
          داده‌ای بازیابی نشد
          {intent && intent.category !== "general" && (
            <Badge variant="accent" className="text-[10px]">
              {intent.category} · {fa(intent.confidence.toFixed(2))}
            </Badge>
          )}
          {intent?.searchQuery && (
            <Badge variant="default" className="text-[10px]" dir="rtl">
              جستجو: {intent.searchQuery}
            </Badge>
          )}
        </span>
      </div>
    );
  }

  const totalItems = chunks.length + facts.length + qa.length;

  return (
    <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-start text-xs font-bold text-muted"
      >
        <span className="flex items-center gap-2">
          <Database className="size-3.5 text-accent" />
          داده‌های بازیابی‌شده ({fa(totalItems)})
          {intent && intent.category !== "general" && (
            <Badge variant="accent" className="text-[10px]">
              {intent.category} · {fa(intent.confidence.toFixed(2))}
            </Badge>
          )}
          {intent?.searchQuery && (
            <Badge variant="default" className="text-[10px]" dir="rtl">
              جستجو: {intent.searchQuery}
            </Badge>
          )}
        </span>
        <span className="text-accent">{expanded ? "بستن" : "نمایش"}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
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
  );
};
