export type QueueItemStatus = "pending" | "opened" | "done" | "skipped";

export type ReplyTone =
  | "supportive"
  | "insightful"
  | "curious"
  | "builder"
  | "casual";

export type CommentSourceMode = "smart" | "ai" | "manual";

export type AiProvider = "gemini" | "groq" | "openai_compat";

export interface QueueItem {
  id: string;
  tweetId: string;
  username: string;
  canonicalUrl: string;
  originalInputUrl: string;
  authorName: string;
  authorHandle: string;
  postText: string;
  postDate: string;
  fetchState: "idle" | "loading" | "ready" | "fallback";
  fetchError?: string;
  comment: string;
  commentOrigin?: "manual" | "csv" | "smart" | "ai" | "template" | "batch_import";
  status: QueueItemStatus;
  openedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export interface TemplatePack {
  id: string;
  name: string;
  lines: string[];
}

export interface AppSettings {
  aiProvider: AiProvider;
  geminiApiKey: string;
  groqApiKey: string;
  customApiBaseUrl: string;
  customApiKey: string;
  customModel: string;
  openTarget: "popup" | "tab";
  recommendedDelaySeconds: number;
  autoCopyOnOpen: boolean;
}

export interface ParsedLinkEntry {
  tweetId: string;
  username: string;
  canonicalUrl: string;
  originalUrl: string;
  inlineComment?: string;
}

export interface ParseLinksResult {
  entries: ParsedLinkEntry[];
  duplicateCount: number;
  ignoredCount: number;
}
