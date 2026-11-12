"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Send,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { QueueItem } from "@/lib/types";
import { buildXPostUrl, buildXReplyIntentUrl } from "@/lib/x-utils";

interface FocusRunnerProps {
  item: QueueItem | null;
  remainingCount: number;
  totalCount: number;
  isDuplicate: boolean;
  cooldownRemainingSec: number;
  isRegenerating: boolean;
  useNativeAnchor: boolean;
  onUpdateComment: (id: string, comment: string) => void;
  onRegenerateOne: (item: QueueItem) => void;
  onOpenReply: (item: QueueItem, openedViaAnchor?: boolean) => void;
  onMarkDoneAndNext: (id: string) => void;
  onSkip: (id: string) => void;
}

export default function FocusRunner({
  item,
  remainingCount,
  totalCount,
  isDuplicate,
  cooldownRemainingSec,
  isRegenerating,
  useNativeAnchor,
  onUpdateComment,
  onRegenerateOne,
  onOpenReply,
  onMarkDoneAndNext,
  onSkip,
}: FocusRunnerProps) {
  if (!item) {
    if (totalCount === 0) return null;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
          All queued links completed!
        </h3>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
          Paste more X links on the left or reset skipped items below to start
          another session.
        </p>
      </div>
    );
  }

  const charCount = item.comment.length;
  const overLimit = charCount > 280;
  const emptyComment = item.comment.trim().length === 0;
  const postUrl = buildXPostUrl(
    item.authorHandle || item.username,
    item.tweetId
  );
  const intentUrl = buildXReplyIntentUrl(item.tweetId, item.comment);

  return (
    <section
      aria-label="Guided Reply Runner"
      className="rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-900/70 dark:bg-slate-900"
    >
      {/* Top Runner Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-sky-50/90 to-slate-50 px-5 py-3 dark:border-slate-800 dark:from-sky-950/40 dark:to-slate-900">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full bg-sky-500 px-2.5 text-xs font-semibold text-white">
            Active Queue
          </span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {remainingCount} remaining of {totalCount} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cooldownRemainingSec > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              <Clock className="h-3 w-3" />
              Suggested pace: {cooldownRemainingSec}s
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Natural pace ready
            </span>
          )}
        </div>
      </div>

      {/* Post Context Card */}
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-700">
                {(item.authorName || item.authorHandle || "X")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.authorName ||
                    (item.authorHandle
                      ? `@${item.authorHandle}`
                      : "X Post Author")}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.authorHandle || item.username
                    ? `@${item.authorHandle || item.username}`
                    : `Post #${item.tweetId}`}
                  {item.postDate ? ` · ${item.postDate}` : ""}
                </div>
              </div>
            </div>

            <a
              href={postUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              View Post
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {item.postText ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {item.postText}
            </p>
          ) : (
            <p className="text-xs italic text-slate-500 dark:text-slate-400">
              {item.fetchError ||
                "Post preview text wasn't returned by oEmbed — you can still write your reply and open it on X."}
            </p>
          )}
        </div>

        {/* Reply Draft Box */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Your Comment Draft
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isRegenerating}
                onClick={() => onRegenerateOne(item)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-600 transition hover:bg-sky-50 disabled:opacity-50 dark:text-sky-400 dark:hover:bg-sky-950/50"
              >
                {isRegenerating ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Regenerate
              </button>
              <span
                className={`font-mono text-xs ${
                  overLimit
                    ? "font-semibold text-rose-600 dark:text-rose-400"
                    : "text-slate-400"
                }`}
              >
                {charCount}/280
              </span>
            </div>
          </div>

          <textarea
            rows={3}
            value={item.comment}
            onChange={(e) => onUpdateComment(item.id, e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onMarkDoneAndNext(item.id);
              }
            }}
            placeholder="Write your reply here or click Regenerate / Smart Auto on the left..."
            className={`w-full rounded-xl border bg-white p-3 text-sm text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-950 dark:text-white ${
              overLimit
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-slate-300 focus:border-sky-500 focus:ring-sky-500/20 dark:border-slate-700"
            }`}
          />

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              {isDuplicate && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  Duplicate reply detected — tweak a few words so X doesn&apos;t
                  flag it
                </span>
              )}
              {overLimit && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
                  Over 280 characters (standard X accounts require ≤ 280)
                </span>
              )}
            </div>
            <span className="text-slate-400">
              Tip: Press Ctrl/Cmd + Enter to mark Done &amp; advance
            </span>
          </div>
        </div>

        {/* Primary Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {useNativeAnchor && !emptyComment ? (
            <a
              href={intentUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenReply(item, true)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-600"
            >
              <Send className="h-4 w-4" />
              1. Open Pre-filled Reply on X
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </a>
          ) : (
            <button
              type="button"
              disabled={emptyComment}
              onClick={() => onOpenReply(item, false)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-600"
            >
              <Send className="h-4 w-4" />
              1. Open Pre-filled Reply on X
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onMarkDoneAndNext(item.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            2. Mark Done &amp; Next
          </button>

          <button
            type="button"
            onClick={() => onSkip(item.id)}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </button>
        </div>
      </div>
    </section>
  );
}
