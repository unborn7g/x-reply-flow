"use client";

import React, { useMemo, useState } from "react";
import { Check, ClipboardCopy, Sparkles, X } from "lucide-react";
import type { QueueItem, ReplyTone } from "@/lib/types";
import {
  buildBatchChatGptPrompt,
  parseBatchRepliesInput,
} from "@/lib/x-utils";

interface BatchPromptModalProps {
  open: boolean;
  onClose: () => void;
  targetItems: QueueItem[];
  tone: ReplyTone;
  customAngle: string;
  onApplyReplies: (mapped: Array<{ id: string; comment: string }>) => void;
}

export default function BatchPromptModal({
  open,
  onClose,
  targetItems,
  tone,
  customAngle,
  onApplyReplies,
}: BatchPromptModalProps) {
  const [tab, setTab] = useState<"prompt" | "import">("prompt");
  const [copied, setCopied] = useState(false);
  const [rawReplies, setRawReplies] = useState("");

  const promptText = useMemo(
    () => buildBatchChatGptPrompt(targetItems, tone, customAngle),
    [targetItems, tone, customAngle]
  );

  const parsedPreview = useMemo(
    () => parseBatchRepliesInput(rawReplies, targetItems.length),
    [rawReplies, targetItems.length]
  );

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback handled by user selecting textarea
    }
  };

  const handleApply = () => {
    const mapped = targetItems
      .map((item, idx) => ({
        id: item.id,
        comment: parsedPreview[idx]?.trim() ?? "",
      }))
      .filter((entry) => entry.comment.length > 0);

    if (mapped.length > 0) {
      onApplyReplies(mapped);
      setRawReplies("");
      onClose();
    }
  };

  const matchedCount = parsedPreview.filter((p) => p.trim().length > 0).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2
              id="batch-modal-title"
              className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"
            >
              <Sparkles className="h-4 w-4 text-sky-500" />
              Zero-Key AI Helper ({targetItems.length} Pending Posts)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Use free ChatGPT, Gemini, or Claude web chat — then paste the
              numbered replies back here in 1 click.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50 px-6 dark:border-slate-800 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => setTab("prompt")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === "prompt"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            1. Copy Prompt
          </button>
          <button
            type="button"
            onClick={() => setTab("import")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === "import"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            2. Paste Replies Back
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {targetItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Add at least one pending X link to your queue first.
            </div>
          ) : tab === "prompt" ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Copy this prompt into ChatGPT / Gemini / Claude:
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-600"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      Copy Prompt
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                value={promptText}
                rows={12}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setTab("import")}
                  className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                >
                  Next: Paste replies back →
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Paste the numbered list from your AI chat (e.g.{" "}
                  <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                    1. Great insight...
                  </code>
                  ):
                </label>
                <textarea
                  value={rawReplies}
                  onChange={(e) => setRawReplies(e.target.value)}
                  rows={8}
                  placeholder={`1. Congrats on shipping this! Curious what surprised you most?\n2. Super clear breakdown — bookmarked for later.`}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {rawReplies.trim() && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Preview mapping ({matchedCount} of {targetItems.length}{" "}
                    matched):
                  </div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    {targetItems.map((item, i) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-slate-400">
                          #{i + 1}
                        </span>
                        <span className="shrink-0 font-medium text-slate-700 dark:text-slate-300">
                          {item.authorHandle
                            ? `@${item.authorHandle}`
                            : item.username || "post"}
                          :
                        </span>
                        <span
                          className={
                            parsedPreview[i]
                              ? "text-slate-700 dark:text-slate-200"
                              : "italic text-slate-400"
                          }
                        >
                          {parsedPreview[i] || "(no reply matched)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3.5 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          {tab === "import" && (
            <button
              type="button"
              disabled={matchedCount === 0}
              onClick={handleApply}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply {matchedCount} Replies
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
