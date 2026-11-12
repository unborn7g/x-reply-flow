"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileUp,
  Layers,
  Link2,
  Loader2,
  MessageSquarePlus,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  CommentSourceMode,
  QueueItem,
  QueueItemStatus,
  ReplyTone,
  TemplatePack,
} from "@/lib/types";
import {
  applyTemplateVariables,
  buildXPostUrl,
  buildXReplyIntentUrl,
  exportQueueToCsv,
  exportQueueToStandaloneHtml,
  findDuplicateCommentIds,
  generateSmartOfflineReply,
  parseXLinks,
} from "@/lib/x-utils";
import FocusRunner from "./FocusRunner";
import SettingsModal from "./SettingsModal";
import BatchPromptModal from "./BatchPromptModal";

const STORAGE_QUEUE_KEY = "x_replyflow_queue_v1";
const STORAGE_SETTINGS_KEY = "x_replyflow_settings_v1";
const STORAGE_TEMPLATES_KEY = "x_replyflow_templates_v1";
const STORAGE_THEME_KEY = "x_replyflow_theme_v1";

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: "gemini",
  geminiApiKey: "",
  groqApiKey: "",
  customApiBaseUrl: "",
  customApiKey: "",
  customModel: "",
  openTarget: "popup",
  recommendedDelaySeconds: 20,
  autoCopyOnOpen: true,
};

const STARTER_PACKS: TemplatePack[] = [
  {
    id: "friendly",
    name: "Warm & Supportive",
    lines: [
      "Really appreciate how clearly you broke down {topic}, {author}!",
      "Great point on {topic} — saved this to revisit later.",
      "Spot on, {author}. Consistency on {topic} compounds fast.",
      "Love this take on {topic}! Thanks for sharing it here.",
    ],
  },
  {
    id: "questions",
    name: "Curious Questions",
    lines: [
      "Interesting perspective on {topic}, {author} — what surprised you most?",
      "Great breakdown on {topic}! Which part took the longest to figure out?",
      "Curious how you approach {topic} when starting from scratch, {author}?",
    ],
  },
  {
    id: "builders",
    name: "Builder Community",
    lines: [
      "Clean execution on {topic}, {author} — keep shipping!",
      "Real builder notes on {topic} right here. Appreciate the share!",
      "Respect the craft behind {topic}, {author}. Wishing you momentum!",
    ],
  },
];

const DEMO_LINKS_TEXT = `https://x.com/nextjs/status/2107579978854645875
https://x.com/nextjs/status/2108290555709112668
https://x.com/jack/status/20`;

const TONE_OPTIONS: Array<{ id: ReplyTone; label: string; hint: string }> = [
  { id: "supportive", label: "Supportive", hint: "Warm & encouraging" },
  { id: "insightful", label: "Insightful", hint: "Adds thoughtful angle" },
  { id: "curious", label: "Curious", hint: "Asks smart question" },
  { id: "builder", label: "Builder", hint: "Maker / founder vibe" },
  { id: "casual", label: "Casual", hint: "Short & natural" },
];

function createItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ReplyStudio() {
  const [hydrated, setHydrated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [templatePacks, setTemplatePacks] =
    useState<TemplatePack[]>(STARTER_PACKS);
  const [serverAi, setServerAi] = useState<{ gemini: boolean; groq: boolean }>({
    gemini: false,
    groq: false,
  });

  // Left panel states
  const [linksInput, setLinksInput] = useState("");
  const [isFetchingLinks, setIsFetchingLinks] = useState(false);

  const [commentMode, setCommentMode] = useState<CommentSourceMode>("smart");
  const [tone, setTone] = useState<ReplyTone>("supportive");
  const [customAngle, setCustomAngle] = useState("");
  const [onlyFillBlank, setOnlyFillBlank] = useState(true);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Manual comments / templates state
  const [manualCommentsText, setManualCommentsText] = useState(
    STARTER_PACKS[0].lines.join("\n")
  );
  const [manualAssignMode, setManualAssignMode] = useState<
    "in_order" | "rotate_random"
  >("rotate_random");
  const [newPackName, setNewPackName] = useState("");

  // Right panel states
  const [showRunner, setShowRunner] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | QueueItemStatus>(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pace timer state
  const [lastOpenedAt, setLastOpenedAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [dismissedEmbedBanner, setDismissedEmbedBanner] = useState(false);

  // Modals & notifications
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: "info" | "success" | "warning" | "error";
    text: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(
    (
      text: string,
      type: "info" | "success" | "warning" | "error" = "info",
      action?: { url: string; label: string }
    ) => {
      setToast({
        type,
        text,
        actionUrl: action?.url,
        actionLabel: action?.label,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(
        () => setToast(null),
        action ? 10000 : 4200
      );
    },
    []
  );

  // Hydrate from localStorage + check server health
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        if (Array.isArray(parsed)) setQueue(parsed);
      }

      const savedSettings = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (savedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      }

      const savedPacks = localStorage.getItem(STORAGE_TEMPLATES_KEY);
      if (savedPacks) {
        const parsed = JSON.parse(savedPacks);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplatePacks(parsed);
        }
      }

      const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
      const prefersDark =
        savedTheme === "dark" ||
        (!savedTheme &&
          window.matchMedia?.("(prefers-color-scheme: dark)").matches);
      setDarkMode(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);
    } catch {
      // Ignore corrupted localStorage
    }
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true);
    }
    setHydrated(true);

    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.serverAi) setServerAi(data.serverAi);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Ignore quota exceeded
    }
  }, [queue, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(templatePacks));
    } catch {
      // Ignore
    }
  }, [templatePacks, hydrated]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, next ? "dark" : "light");
    } catch {
      // Ignore
    }
  };

  // Pace countdown tick
  useEffect(() => {
    if (lastOpenedAt === 0 || settings.recommendedDelaySeconds <= 0) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [lastOpenedAt, settings.recommendedDelaySeconds]);

  const cooldownRemainingSec = useMemo(() => {
    if (lastOpenedAt === 0 || settings.recommendedDelaySeconds <= 0) return 0;
    const elapsedSec = Math.floor((nowMs - lastOpenedAt) / 1000);
    return Math.max(0, settings.recommendedDelaySeconds - elapsedSec);
  }, [lastOpenedAt, nowMs, settings.recommendedDelaySeconds]);

  // Derived stats & filters
  const stats = useMemo(() => {
    let pending = 0;
    let opened = 0;
    let done = 0;
    let skipped = 0;
    for (const item of queue) {
      if (item.status === "pending") pending += 1;
      else if (item.status === "opened") opened += 1;
      else if (item.status === "done") done += 1;
      else if (item.status === "skipped") skipped += 1;
    }
    return {
      total: queue.length,
      pending,
      opened,
      done,
      skipped,
      remaining: pending + opened,
    };
  }, [queue]);

  const duplicateCommentIds = useMemo(
    () => findDuplicateCommentIds(queue),
    [queue]
  );

  const activeRunnerItem = useMemo(
    () =>
      queue.find((q) => q.status === "pending" || q.status === "opened") ??
      null,
    [queue]
  );

  const pendingQueueItems = useMemo(
    () => queue.filter((q) => q.status === "pending" || q.status === "opened"),
    [queue]
  );

  const filteredQueue = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return queue.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!query) return true;
      return (
        item.authorHandle.toLowerCase().includes(query) ||
        item.authorName.toLowerCase().includes(query) ||
        item.username.toLowerCase().includes(query) ||
        item.postText.toLowerCase().includes(query) ||
        item.comment.toLowerCase().includes(query) ||
        item.tweetId.includes(query)
      );
    });
  }, [queue, statusFilter, searchQuery]);

  const hasAiConfigured = useMemo(() => {
    if (settings.aiProvider === "gemini") {
      return Boolean(settings.geminiApiKey.trim() || serverAi.gemini);
    }
    if (settings.aiProvider === "groq") {
      return Boolean(settings.groqApiKey.trim() || serverAi.groq);
    }
    return Boolean(
      settings.customApiBaseUrl.trim() && settings.customApiKey.trim()
    );
  }, [settings, serverAi]);

  // Step 1: Parse links & fetch oEmbed previews
  const handleAddLinks = async (rawOverride?: string) => {
    const sourceText = rawOverride ?? linksInput;
    const existingIds = new Set(queue.map((q) => q.tweetId));
    const parsed = parseXLinks(sourceText, existingIds);

    if (parsed.entries.length === 0) {
      if (parsed.duplicateCount > 0) {
        notify(
          `Skipped ${parsed.duplicateCount} duplicate link(s) already in queue.`,
          "warning"
        );
      } else {
        notify(
          "No valid X/Twitter post links found (expected links like https://x.com/user/status/12345).",
          "error"
        );
      }
      return;
    }

    setIsFetchingLinks(true);

    // Create initial placeholders immediately so UI feels snappy
    const initialItems: QueueItem[] = parsed.entries.map((entry) => ({
      id: createItemId(),
      tweetId: entry.tweetId,
      username: entry.username,
      canonicalUrl: entry.canonicalUrl,
      originalInputUrl: entry.originalUrl,
      authorName: entry.username ? `@${entry.username}` : "X User",
      authorHandle: entry.username,
      postText: "",
      postDate: "",
      fetchState: "loading",
      comment: entry.inlineComment ?? "",
      commentOrigin: entry.inlineComment ? "csv" : undefined,
      status: "pending",
      createdAt: Date.now(),
    }));

    setQueue((prev) => [...prev, ...initialItems]);
    if (!rawOverride) setLinksInput("");

    try {
      const res = await fetch("/api/oembed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: parsed.entries.map((e) => e.canonicalUrl),
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        results: Array<{
          tweetId: string;
          canonicalUrl: string;
          authorName: string;
          authorHandle: string;
          postText: string;
          postDate: string;
          ok: boolean;
          error?: string;
        }>;
      };

      const byTweetId = new Map(data.results.map((r) => [r.tweetId, r]));
      const usedComments = new Set(
        queue.map((q) => q.comment.trim().toLowerCase()).filter(Boolean)
      );

      let fetchedOkCount = 0;

      setQueue((prev) =>
        prev.map((item) => {
          const matched = byTweetId.get(item.tweetId);
          if (!matched || item.fetchState !== "loading") return item;

          if (matched.ok) fetchedOkCount += 1;

          const updated: QueueItem = {
            ...item,
            canonicalUrl: matched.canonicalUrl || item.canonicalUrl,
            authorName: matched.authorName || item.authorName,
            authorHandle: matched.authorHandle || item.authorHandle,
            username: matched.authorHandle || item.username,
            postText: matched.postText,
            postDate: matched.postDate,
            fetchState: matched.ok ? "ready" : "fallback",
            fetchError: matched.error,
          };

          // Auto-fill comment with Smart Auto if no inline comment was provided
          if (!updated.comment.trim() && commentMode === "smart") {
            updated.comment = generateSmartOfflineReply(updated, {
              tone,
              customAngle,
              usedComments,
            });
            updated.commentOrigin = "smart";
          }

          return updated;
        })
      );

      const notes: string[] = [
        `Added ${parsed.entries.length} post${
          parsed.entries.length === 1 ? "" : "s"
        } (${fetchedOkCount} sourced via X oEmbed)`,
      ];
      if (parsed.duplicateCount > 0) {
        notes.push(`${parsed.duplicateCount} duplicate skipped`);
      }
      if (parsed.ignoredCount > 0) {
        notes.push(`${parsed.ignoredCount} invalid line ignored`);
      }
      notify(notes.join(" · "), "success");
    } catch {
      setQueue((prev) =>
        prev.map((item) =>
          item.fetchState === "loading"
            ? {
                ...item,
                fetchState: "fallback",
                fetchError:
                  "Could not fetch preview automatically; ready for manual reply.",
              }
            : item
        )
      );
      notify(
        "Links added, but X oEmbed preview lookup failed. You can still comment manually.",
        "warning"
      );
    } finally {
      setIsFetchingLinks(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      if (content.trim()) {
        setLinksInput((prev) => (prev.trim() ? `${prev}\n${content}` : content));
        notify(`Loaded links from ${file.name}. Click "Source Posts & Add" next.`, "info");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Step 2A: Generate with built-in $0 Smart Auto
  const handleSmartGenerateBatch = () => {
    const targets = queue.filter((q) => {
      if (q.status !== "pending" && q.status !== "opened") return false;
      if (onlyFillBlank && q.comment.trim().length > 0) return false;
      return true;
    });

    if (targets.length === 0) {
      notify(
        onlyFillBlank
          ? "No blank pending links to fill. Uncheck 'Only fill blank comments' to overwrite."
          : "Add pending X links first.",
        "warning"
      );
      return;
    }

    const usedComments = new Set(
      queue
        .filter((q) => !targets.some((t) => t.id === q.id))
        .map((q) => q.comment.trim().toLowerCase())
        .filter(Boolean)
    );

    const targetIds = new Set(targets.map((t) => t.id));
    let idx = 0;
    setQueue((prev) =>
      prev.map((item) => {
        if (!targetIds.has(item.id)) return item;
        const reply = generateSmartOfflineReply(item, {
          tone,
          customAngle,
          batchIndex: idx++,
          usedComments,
        });
        return { ...item, comment: reply, commentOrigin: "smart" };
      })
    );

    notify(
      `Generated ${targets.length} tailored comments ($0 Smart Auto).`,
      "success"
    );
  };

  // Step 2B: Generate with Free-Tier AI (Gemini / Groq / Custom)
  const handleAiGenerateBatch = async () => {
    const targets = queue.filter((q) => {
      if (q.status !== "pending" && q.status !== "opened") return false;
      if (onlyFillBlank && q.comment.trim().length > 0) return false;
      return true;
    });

    if (targets.length === 0) {
      notify(
        onlyFillBlank
          ? "No blank pending links to fill. Uncheck 'Only fill blank comments' to regenerate."
          : "Add pending X links first.",
        "warning"
      );
      return;
    }

    if (!hasAiConfigured) {
      setSettingsOpen(true);
      notify(
        "Add a free Gemini or Groq key in Settings, or click 'Zero-Key ChatGPT Helper'.",
        "info"
      );
      return;
    }

    setIsGeneratingBatch(true);
    try {
      const apiKey =
        settings.aiProvider === "gemini"
          ? settings.geminiApiKey
          : settings.aiProvider === "groq"
          ? settings.groqApiKey
          : settings.customApiKey;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: targets.slice(0, 25).map((t) => ({
            id: t.id,
            tweetId: t.tweetId,
            authorName: t.authorName,
            authorHandle: t.authorHandle,
            postText: t.postText,
            canonicalUrl: t.canonicalUrl,
          })),
          tone,
          customAngle,
          provider: settings.aiProvider,
          apiKey,
          customBaseUrl: settings.customApiBaseUrl,
          customModel: settings.customModel,
        }),
      });

      const data = (await res.json()) as {
        replies?: Array<{ id: string; comment: string }>;
        error?: string;
      };

      if (!res.ok || !data.replies) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const byId = new Map(data.replies.map((r) => [r.id, r.comment]));
      setQueue((prev) =>
        prev.map((item) =>
          byId.has(item.id)
            ? {
                ...item,
                comment: byId.get(item.id)!,
                commentOrigin: "ai",
              }
            : item
        )
      );

      notify(
        `AI wrote ${data.replies.length} contextual comments!`,
        "success"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      notify(msg, "error");
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  // Single item regenerate (uses AI if in AI mode & configured, else Smart Auto)
  const handleRegenerateOne = async (item: QueueItem) => {
    setRegeneratingId(item.id);
    try {
      if (commentMode === "ai" && hasAiConfigured) {
        const apiKey =
          settings.aiProvider === "gemini"
            ? settings.geminiApiKey
            : settings.aiProvider === "groq"
            ? settings.groqApiKey
            : settings.customApiKey;

        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            posts: [
              {
                id: item.id,
                tweetId: item.tweetId,
                authorName: item.authorName,
                authorHandle: item.authorHandle,
                postText: item.postText,
                canonicalUrl: item.canonicalUrl,
              },
            ],
            tone,
            customAngle,
            provider: settings.aiProvider,
            apiKey,
            customBaseUrl: settings.customApiBaseUrl,
            customModel: settings.customModel,
          }),
        });
        const data = (await res.json()) as {
          replies?: Array<{ id: string; comment: string }>;
          error?: string;
        };
        if (res.ok && data.replies?.[0]?.comment) {
          updateItemComment(item.id, data.replies[0].comment, "ai");
          return;
        }
      }

      const used = new Set(
        queue
          .filter((q) => q.id !== item.id)
          .map((q) => q.comment.trim().toLowerCase())
          .filter(Boolean)
      );
      used.add(item.comment.trim().toLowerCase());

      const nextReply = generateSmartOfflineReply(item, {
        tone,
        customAngle,
        batchIndex: Math.floor(Math.random() * 100),
        usedComments: used,
      });
      updateItemComment(item.id, nextReply, "smart");
    } finally {
      setRegeneratingId(null);
    }
  };

  // Step 2C: Apply manual comments / templates
  const handleApplyManualComments = () => {
    const lines = manualCommentsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      notify("Paste at least one comment or template line first.", "warning");
      return;
    }

    const targets = queue.filter((q) => {
      if (q.status !== "pending" && q.status !== "opened") return false;
      if (onlyFillBlank && q.comment.trim().length > 0) return false;
      return true;
    });

    if (targets.length === 0) {
      notify(
        onlyFillBlank
          ? "No blank pending links left. Uncheck 'Only fill blank comments' to overwrite."
          : "Add pending X links first.",
        "warning"
      );
      return;
    }

    const targetIndexMap = new Map(targets.map((t, idx) => [t.id, idx]));

    setQueue((prev) =>
      prev.map((item) => {
        const idx = targetIndexMap.get(item.id);
        if (idx === undefined) return item;

        const templateLine =
          manualAssignMode === "in_order"
            ? lines[idx] ?? lines[idx % lines.length]
            : lines[(idx + Math.floor(Math.random() * lines.length)) % lines.length];

        const rendered = applyTemplateVariables(templateLine, item);
        return {
          ...item,
          comment: rendered,
          commentOrigin: "template",
        };
      })
    );

    notify(
      `Applied comments to ${targets.length} pending link${
        targets.length === 1 ? "" : "s"
      }.`,
      "success"
    );
  };

  const handleSaveTemplatePack = () => {
    const lines = manualCommentsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const name = newPackName.trim();
    if (!name || lines.length === 0) {
      notify("Enter a pack name and at least one comment line.", "warning");
      return;
    }

    const nextPack: TemplatePack = {
      id: createItemId(),
      name,
      lines,
    };
    setTemplatePacks((prev) => [nextPack, ...prev]);
    setNewPackName("");
    notify(`Saved template pack "${name}".`, "success");
  };

  // Queue item mutations
  const updateItemComment = (
    id: string,
    comment: string,
    origin?: QueueItem["commentOrigin"]
  ) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              comment,
              commentOrigin: origin ?? item.commentOrigin ?? "manual",
            }
          : item
      )
    );
  };

  const updateItemStatus = (id: string, status: QueueItemStatus) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          status,
          completedAt: status === "done" ? Date.now() : item.completedAt,
        };
      })
    );
  };

  const copyTextWithFallback = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to textarea copy
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const handleOpenReplyOnX = (item: QueueItem, openedViaAnchor = false) => {
    const intentUrl = buildXReplyIntentUrl(item.tweetId, item.comment);

    if (settings.autoCopyOnOpen && item.comment.trim()) {
      void copyTextWithFallback(item.comment.trim());
    }

    if (!openedViaAnchor) {
      let win: Window | null = null;
      if (settings.openTarget === "popup") {
        win = window.open(
          intentUrl,
          "x_replyflow_intent",
          "width=620,height=680,noopener,noreferrer"
        );
        if (!win) {
          win = window.open(intentUrl, "_blank", "noopener,noreferrer");
        }
      } else {
        win = window.open(intentUrl, "_blank", "noopener,noreferrer");
      }

      if (!win) {
        notify(
          "Popup blocked in preview frame — click the direct button below or open this preview in a new browser tab:",
          "warning",
          { url: intentUrl, label: "Open X Reply Directly ↗" }
        );
      } else {
        notify(
          `Opened X reply for @${item.authorHandle || item.username || "post"}${
            settings.autoCopyOnOpen ? " (comment also copied!)" : ""
          }`,
          "success"
        );
      }
    } else {
      notify(
        isEmbedded
          ? `Reply text copied! If X didn't open inside Arena's frame, click "Download Runner (.html)" at the top to launch X in your browser.`
          : `Opened X reply for @${item.authorHandle || item.username || "post"}${
              settings.autoCopyOnOpen ? " (comment copied too!)" : ""
            }`,
        isEmbedded ? "info" : "success"
      );
    }

    const now = Date.now();
    setLastOpenedAt(now);
    setNowMs(now);

    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: q.status === "done" ? "done" : "opened",
              openedAt: now,
            }
          : q
      )
    );
  };

  const handleCopyComment = async (item: QueueItem) => {
    const ok = await copyTextWithFallback(item.comment);
    if (ok) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } else {
      notify("Could not copy automatically — select the text manually.", "warning");
    }
  };

  const handleExportCsv = () => {
    if (queue.length === 0) {
      notify("Nothing in queue to export yet.", "warning");
      return;
    }
    const csv = exportQueueToCsv(queue);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `x-replyflow-queue-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Exported queue + X reply links to CSV.", "success");
  };

  const handleDownloadStandaloneHtml = () => {
    if (queue.length === 0) {
      notify("Add links to your queue first before downloading the runner.", "warning");
      return;
    }
    const html = exportQueueToStandaloneHtml(queue);
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `x-replyflow-runner-${new Date()
      .toISOString()
      .slice(0, 10)}.html`;
    link.click();
    URL.revokeObjectURL(url);
    notify(
      "Downloaded x-replyflow-runner.html! Double-click that file in your Downloads folder to open X replies directly in your browser.",
      "success"
    );
  };

  const handleApplyBatchModalReplies = (
    mapped: Array<{ id: string; comment: string }>
  ) => {
    const byId = new Map(mapped.map((m) => [m.id, m.comment]));
    setQueue((prev) =>
      prev.map((item) =>
        byId.has(item.id)
          ? {
              ...item,
              comment: byId.get(item.id)!,
              commentOrigin: "batch_import",
            }
          : item
      )
    );
    notify(`Applied ${mapped.length} replies to pending posts!`, "success");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white shadow-sm dark:bg-sky-500">
              𝕏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  X ReplyFlow
                </h1>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                  $0 No-API Mode
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste links → Source post context → Generate or write comments →
                1-click reply on your X account
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Progress pill */}
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium dark:border-slate-800 dark:bg-slate-950 sm:flex">
              <span className="text-emerald-600 dark:text-emerald-400">
                {stats.done} done
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="text-sky-600 dark:text-sky-400">
                {stats.remaining} left
              </span>
            </div>

            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-500" />
              ChatGPT Helper
            </button>

            <button
              type="button"
              onClick={handleDownloadStandaloneHtml}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600"
              title="Download a standalone HTML file that runs outside Arena's preview frame so every X reply opens in 1 click"
            >
              <Download className="h-3.5 w-3.5" />
              Download Runner (.html)
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="relative inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
              {hasAiConfigured && (
                <span
                  className="h-2 w-2 rounded-full bg-emerald-500"
                  title="Free AI provider configured"
                />
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="Toggle color theme"
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Embedded Preview Frame Helper Banner */}
      {isEmbedded && !dismissedEmbedBanner && (
        <div className="border-b border-sky-200 bg-sky-50/90 px-4 py-2.5 text-xs text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Arena Preview Tip:</span>
              <span>
                Arena&apos;s preview frame blocks opening external X tabs (and
                preview URLs cannot open outside Arena). Click{" "}
                <strong>Download Runner (.html)</strong> and open the file in
                Chrome — all{" "}
                {stats.total > 0
                  ? `${stats.total} queued posts & replies`
                  : "your queued posts & replies"}{" "}
                will launch directly on X in 1 click!
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
              >
                <Download className="h-3 w-3" />
                Download Runner (.html)
              </button>
              <button
                type="button"
                onClick={() => setDismissedEmbedBanner(true)}
                className="rounded p-1 text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/60"
                aria-label="Dismiss tip"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Two-Column Studio */}
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Link Input + Comment Engine */}
        <div className="space-y-6 lg:col-span-5">
          {/* Card 1: Link Intake */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Link2 className="h-4 w-4 text-sky-500" />
                1. Paste X Post Links
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLinksInput(DEMO_LINKS_TEXT);
                    notify(
                      "Loaded 3 sample public X links — click 'Source Posts & Add'!",
                      "info"
                    );
                  }}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Load Demo Links
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FileUp className="h-3 w-3" />
                  TXT / CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            <textarea
              rows={5}
              value={linksInput}
              onChange={(e) => setLinksInput(e.target.value)}
              placeholder={`Paste X/Twitter links (one per line, or CSV "link, your comment"):\nhttps://x.com/username/status/1234567890\nhttps://x.com/another/status/9876543210, Awesome launch!`}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 font-mono text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
            />

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Supports x.com, WhatsApp/Telegram bot dumps, &amp; CSV pairs
              </span>
              <button
                type="button"
                disabled={isFetchingLinks || !linksInput.trim()}
                onClick={() => handleAddLinks()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-600"
              >
                {isFetchingLinks ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sourcing Posts...
                  </>
                ) : (
                  <>
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Source Posts &amp; Add
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Card 2: Comment Generator & Templates */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Wand2 className="h-4 w-4 text-sky-500" />
                2. Source or Write Comments
              </h2>
            </div>

            {/* Mode Tabs */}
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
              {(
                [
                  { id: "smart", label: "Smart Auto ($0)" },
                  { id: "ai", label: "Free AI Key" },
                  { id: "manual", label: "Your Comments" },
                ] as Array<{ id: CommentSourceMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCommentMode(m.id)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    commentMode === m.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {commentMode !== "manual" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Reply Tone
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {TONE_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTone(t.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition ${
                          tone === t.id
                            ? "border-sky-500 bg-sky-50/70 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                        }`}
                      >
                        <div className="text-xs font-semibold">{t.label}</div>
                        <div className="text-[10px] opacity-75">{t.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Optional Angle / Custom Note
                  </label>
                  <input
                    type="text"
                    value={customAngle}
                    onChange={(e) => setCustomAngle(e.target.value)}
                    placeholder="e.g., mention our launch, or keep it under 12 words"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={onlyFillBlank}
                    onChange={(e) => setOnlyFillBlank(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Only fill links that don&apos;t have a comment yet
                </label>

                {commentMode === "smart" ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleSmartGenerateBatch}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-600"
                    >
                      <Wand2 className="h-4 w-4" />
                      Generate Contextual Replies ($0 Built-in)
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Reads each fetched post&apos;s topic, author, and intent
                      locally — zero API keys or billing required.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {!hasAiConfigured && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        No AI key set yet. Add a free{" "}
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(true)}
                          className="font-semibold underline"
                        >
                          Gemini or Groq key in Settings
                        </button>
                        , or use the{" "}
                        <button
                          type="button"
                          onClick={() => setBatchModalOpen(true)}
                          className="font-semibold underline"
                        >
                          Zero-Key ChatGPT Helper
                        </button>
                        .
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isGeneratingBatch}
                        onClick={handleAiGenerateBatch}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
                      >
                        {isGeneratingBatch ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Writing AI Replies...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Generate with Free AI ({settings.aiProvider})
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchModalOpen(true)}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        ChatGPT Prompt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Manual / Template List Mode */
              <div className="space-y-3.5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Quick Template Packs
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {templatePacks.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() =>
                          setManualCommentsText(pack.lines.join("\n"))
                        }
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        {pack.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Your Comments (1 per line — variables:{" "}
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                      {"{author}"}
                    </code>{" "}
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                      {"{topic}"}
                    </code>
                    )
                  </label>
                  <textarea
                    rows={5}
                    value={manualCommentsText}
                    onChange={(e) => setManualCommentsText(e.target.value)}
                    placeholder="Paste one comment per line..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={manualAssignMode}
                      onChange={(e) =>
                        setManualAssignMode(
                          e.target.value as "in_order" | "rotate_random"
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="rotate_random">Rotate / Mix Lines</option>
                      <option value="in_order">Match 1-to-1 In Order</option>
                    </select>
                  </div>

                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={onlyFillBlank}
                      onChange={(e) => setOnlyFillBlank(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                    />
                    Only blank
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleApplyManualComments}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-600"
                >
                  <Layers className="h-4 w-4" />
                  Assign Comments to Pending Links
                </button>

                <div className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <input
                    type="text"
                    value={newPackName}
                    onChange={(e) => setNewPackName(e.target.value)}
                    placeholder="Save lines as pack name..."
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTemplatePack}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Save Pack
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Guided Runner & Queue */}
        <div className="space-y-6 lg:col-span-7">
          {/* Guided Focus Runner */}
          {showRunner && (
            <FocusRunner
              item={activeRunnerItem}
              remainingCount={stats.remaining}
              totalCount={stats.total}
              isDuplicate={
                activeRunnerItem
                  ? duplicateCommentIds.has(activeRunnerItem.id)
                  : false
              }
              cooldownRemainingSec={cooldownRemainingSec}
              isRegenerating={
                Boolean(activeRunnerItem) &&
                regeneratingId === activeRunnerItem?.id
              }
              useNativeAnchor={isEmbedded || settings.openTarget === "tab"}
              onUpdateComment={(id, comment) => updateItemComment(id, comment)}
              onRegenerateOne={handleRegenerateOne}
              onOpenReply={handleOpenReplyOnX}
              onMarkDoneAndNext={(id) => updateItemStatus(id, "done")}
              onSkip={(id) => updateItemStatus(id, "skipped")}
            />
          )}

          {/* Queue List Card */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    3. Reply Queue ({stats.total})
                  </h2>
                  {duplicateCommentIds.size > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {duplicateCommentIds.size} duplicate replies
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowRunner((v) => !v)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {showRunner ? "Hide Runner" : "Show Runner"}
                  </button>
                  {stats.done > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQueue((prev) =>
                          prev.filter((q) => q.status !== "done")
                        )
                      }
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Clear Done
                    </button>
                  )}
                  {stats.total > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQueue([]);
                        notify("Cleared queue.", "info");
                      }}
                      className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Filter & Search bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: "all", label: `All (${stats.total})` },
                      { id: "pending", label: `Pending (${stats.pending})` },
                      { id: "opened", label: `Opened (${stats.opened})` },
                      { id: "done", label: `Done (${stats.done})` },
                      { id: "skipped", label: `Skipped (${stats.skipped})` },
                    ] as Array<{
                      id: "all" | QueueItemStatus;
                      label: string;
                    }>
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        statusFilter === f.id
                          ? "bg-slate-900 text-white dark:bg-sky-500"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[190px] flex-1 sm:max-w-[230px]">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter @handle or text..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Queue Items */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredQueue.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-lg font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    𝕏
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {queue.length === 0
                      ? "Your reply queue is empty"
                      : "No posts match this filter"}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                    {queue.length === 0
                      ? "Paste X post links on the left (or click 'Load Demo Links') to source post context and draft replies in seconds."
                      : "Try switching back to All or clearing your search text."}
                  </p>
                </div>
              ) : (
                filteredQueue.map((item, idx) => {
                  const isDup = duplicateCommentIds.has(item.id);
                  const charLen = item.comment.length;
                  const postUrl = buildXPostUrl(
                    item.authorHandle || item.username,
                    item.tweetId
                  );

                  return (
                    <div
                      key={item.id}
                      className={`space-y-3 p-4 sm:p-5 ${
                        item.status === "done"
                          ? "bg-emerald-50/30 opacity-80 dark:bg-emerald-950/10"
                          : item.status === "skipped"
                          ? "opacity-65"
                          : ""
                      }`}
                    >
                      {/* Row Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {item.authorName}
                          </span>
                          {(item.authorHandle || item.username) && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              @{item.authorHandle || item.username}
                            </span>
                          )}
                          <StatusBadge
                            status={item.status}
                            fetchState={item.fetchState}
                          />
                          {item.commentOrigin && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {item.commentOrigin.replace("_", " ")}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            Post
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setQueue((prev) =>
                                prev.filter((q) => q.id !== item.id)
                              )
                            }
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Fetched Post Context */}
                      {item.fetchState === "loading" ? (
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Sourcing post content from X oEmbed...
                        </div>
                      ) : item.postText ? (
                        <p className="line-clamp-3 whitespace-pre-line rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                          {item.postText}
                        </p>
                      ) : (
                        <p className="text-[11px] italic text-slate-400">
                          {item.fetchError ||
                            "No post text preview — reply still works via tweet ID."}
                        </p>
                      )}

                      {/* Editable Reply Box */}
                      <div>
                        <textarea
                          rows={2}
                          value={item.comment}
                          onChange={(e) =>
                            updateItemComment(item.id, e.target.value)
                          }
                          placeholder="Write or generate a comment for this post..."
                          className={`w-full rounded-xl border bg-white p-2.5 text-xs text-slate-900 outline-none transition focus:ring-2 dark:bg-slate-950 dark:text-white ${
                            charLen > 280
                              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                              : "border-slate-200 focus:border-sky-500 focus:ring-sky-500/20 dark:border-slate-700"
                          }`}
                        />

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-mono text-[11px] ${
                                charLen > 280
                                  ? "font-semibold text-rose-600 dark:text-rose-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {charLen}/280
                            </span>
                            {isDup && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                Duplicate text
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={regeneratingId === item.id}
                              onClick={() => handleRegenerateOne(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  regeneratingId === item.id
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                              Regenerate
                            </button>

                            <button
                              type="button"
                              disabled={!item.comment.trim()}
                              onClick={() => handleCopyComment(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <ClipboardCopy className="h-3 w-3" />
                                  Copy
                                </>
                              )}
                            </button>

                            {item.comment.trim() &&
                            (isEmbedded || settings.openTarget === "tab") ? (
                              <a
                                href={buildXReplyIntentUrl(
                                  item.tweetId,
                                  item.comment
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => handleOpenReplyOnX(item, true)}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-600"
                              >
                                <Send className="h-3 w-3" />
                                Reply on X
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled={!item.comment.trim()}
                                onClick={() => handleOpenReplyOnX(item, false)}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-sky-500 dark:hover:bg-sky-600"
                              >
                                <Send className="h-3 w-3" />
                                Reply on X
                              </button>
                            )}

                            {item.status !== "done" ? (
                              <button
                                type="button"
                                onClick={() => updateItemStatus(item.id, "done")}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Done
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemStatus(item.id, "pending")
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Reopen
                              </button>
                            )}

                            {item.status !== "skipped" &&
                              item.status !== "done" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateItemStatus(item.id, "skipped")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                  <SkipForward className="h-3 w-3" />
                                </button>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        serverAi={serverAi}
      />

      <BatchPromptModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        targetItems={pendingQueueItems}
        tone={tone}
        customAngle={customAngle}
        onApplyReplies={handleApplyBatchModalReplies}
      />

      {/* Toast Banner */}
      {toast && (
        <div
          role="status"
          className={`fixed right-5 top-20 z-50 max-w-sm rounded-xl border px-4 py-3 text-xs font-medium shadow-lg backdrop-blur ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/95 dark:text-emerald-200"
              : toast.type === "warning"
              ? "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-200"
              : toast.type === "error"
              ? "border-rose-200 bg-rose-50/95 text-rose-900 dark:border-rose-800 dark:bg-rose-950/95 dark:text-rose-200"
              : "border-slate-200 bg-white/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p>{toast.text}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              aria-label="Close notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {toast.actionUrl && (
            <a
              href={toast.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-600"
            >
              {toast.actionLabel || "Open Link ↗"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  fetchState,
}: {
  status: QueueItemStatus;
  fetchState: QueueItem["fetchState"];
}) {
  if (status === "done") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
        Done
      </span>
    );
  }
  if (status === "opened") {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
        Opened on X
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Skipped
      </span>
    );
  }
  if (fetchState === "fallback") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
        Pending (No preview)
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Pending
    </span>
  );
}
