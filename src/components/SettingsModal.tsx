"use client";

import React from "react";
import { X, KeyRound, ShieldCheck, ExternalLink, Info } from "lucide-react";
import type { AiProvider, AppSettings } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  serverAi: { gemini: boolean; groq: boolean };
}

export default function SettingsModal({
  open,
  onClose,
  settings,
  onChange,
  serverAi,
}: SettingsModalProps) {
  if (!open) return null;

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2
              id="settings-title"
              className="text-lg font-semibold text-slate-900 dark:text-white"
            >
              Settings & Free AI Setup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saved locally in your browser. Zero server storage or fees.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Why $0 Info Box */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs leading-relaxed text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              How this stays 100% Free ($0) & Safe for your X Account
            </div>
            <p>
              X&apos;s official developer API now uses pay-per-use credits. Instead,
              X ReplyFlow reads public post context via X&apos;s free{" "}
              <code className="rounded bg-sky-100 px-1 py-0.5 dark:bg-sky-900/70">
                publish.x.com/oembed
              </code>{" "}
              endpoint and opens official{" "}
              <code className="rounded bg-sky-100 px-1 py-0.5 dark:bg-sky-900/70">
                x.com/intent/tweet?in_reply_to=...
              </code>{" "}
              reply boxes using your already-logged-in X browser session.
            </p>
          </div>

          {/* Reply Launching Preferences */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Reply Window & Account Safety
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Open X Reply In
                </label>
                <select
                  value={settings.openTarget}
                  onChange={(e) =>
                    update("openTarget", e.target.value as "popup" | "tab")
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="popup">Popup Window (side-by-side)</option>
                  <option value="tab">New Browser Tab</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Pace Reminder Interval
                </label>
                <select
                  value={settings.recommendedDelaySeconds}
                  onChange={(e) =>
                    update("recommendedDelaySeconds", Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value={0}>Off (no timer)</option>
                  <option value={15}>15 seconds between replies</option>
                  <option value={20}>20 seconds (recommended)</option>
                  <option value={30}>30 seconds (extra safe)</option>
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Auto-copy reply text to clipboard when opening X
              </span>
              <input
                type="checkbox"
                checked={settings.autoCopyOnOpen}
                onChange={(e) => update("autoCopyOnOpen", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </label>
          </section>

          {/* Optional Free-Tier AI Configuration */}
          <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                <KeyRound className="h-4 w-4 text-sky-500" />
                Optional Free AI Provider (for AI Auto-Reply)
              </h3>
              {(serverAi.gemini || serverAi.groq) && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Server env key active
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Don&apos;t want an API key? You don&apos;t need one — the built-in{" "}
              <strong>Smart Auto ($0)</strong> mode and{" "}
              <strong>ChatGPT/Gemini Batch Prompt</strong> work completely without keys.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "gemini", label: "Google Gemini" },
                    { id: "groq", label: "Groq (Llama)" },
                    { id: "openai_compat", label: "Custom HTTPS" },
                  ] as Array<{ id: AiProvider; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => update("aiProvider", opt.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      settings.aiProvider === opt.id
                        ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {settings.aiProvider === "gemini" && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Gemini API Key{" "}
                    {serverAi.gemini && !settings.geminiApiKey && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        (Vercel server key available)
                      </span>
                    )}
                  </span>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Get free key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={settings.geminiApiKey}
                  onChange={(e) => update("geminiApiKey", e.target.value)}
                  placeholder={
                    serverAi.gemini
                      ? "Using Vercel GEMINI_API_KEY (or paste yours to override)"
                      : "AIza..."
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}

            {settings.aiProvider === "groq" && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Groq API Key{" "}
                    {serverAi.groq && !settings.groqApiKey && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        (Vercel server key available)
                      </span>
                    )}
                  </span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Get free key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={settings.groqApiKey}
                  onChange={(e) => update("groqApiKey", e.target.value)}
                  placeholder={
                    serverAi.groq
                      ? "Using Vercel GROQ_API_KEY (or paste yours to override)"
                      : "gsk_..."
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}

            {settings.aiProvider === "openai_compat" && (
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    HTTPS Base URL
                  </label>
                  <input
                    type="url"
                    value={settings.customApiBaseUrl}
                    onChange={(e) => update("customApiBaseUrl", e.target.value)}
                    placeholder="https://openrouter.ai/api/v1"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Model Name
                    </label>
                    <input
                      type="text"
                      value={settings.customModel}
                      onChange={(e) => update("customModel", e.target.value)}
                      placeholder="meta-llama/llama-3.3-70b-instruct:free"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={settings.customApiKey}
                      onChange={(e) => update("customApiKey", e.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Your browser keys are stored only in local browser storage and
                sent directly to your chosen provider when you click Generate.
              </span>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 px-6 py-3.5 text-right dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
