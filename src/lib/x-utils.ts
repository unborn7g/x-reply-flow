import type {
  ParsedLinkEntry,
  ParseLinksResult,
  QueueItem,
  ReplyTone,
} from "./types";

const X_HOST_PATTERN =
  /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com|twittpr\.com)$/i;

const STATUS_URL_REGEX =
  /(?:https?:\/\/)?(?:(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com|twittpr\.com))\/(?:([A-Za-z0-9_]{1,15})|i\/web)\/status\/(\d{1,22})(?:[^\s,"')\]<>]*)?/gi;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "almost",
  "already",
  "also",
  "always",
  "another",
  "around",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "first",
  "found",
  "going",
  "great",
  "having",
  "https",
  "just",
  "know",
  "learn",
  "little",
  "looking",
  "maybe",
  "might",
  "more",
  "most",
  "much",
  "never",
  "other",
  "people",
  "really",
  "right",
  "should",
  "since",
  "something",
  "still",
  "stuff",
  "their",
  "there",
  "these",
  "thing",
  "things",
  "think",
  "this",
  "those",
  "through",
  "today",
  "until",
  "using",
  "very",
  "want",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "youre",
  "thats",
  "heres",
]);

export function normalizeXStatusUrl(rawUrl: string): ParsedLinkEntry | null {
  let candidate = rawUrl
    .trim()
    .replace(/[*`~]+/g, "")
    .replace(/^["'<(\[]+|[>"'),.;!?\]\\]+$/g, "");
  if (!candidate) return null;

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (!X_HOST_PATTERN.test(parsed.hostname)) {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  let username = "";
  let tweetId = "";

  // Standard: /{username}/status/{id}
  if (parts.length >= 3 && parts[1].toLowerCase() === "status") {
    username = parts[0];
    tweetId = parts[2];
  } else if (
    parts.length >= 4 &&
    parts[0].toLowerCase() === "i" &&
    parts[1].toLowerCase() === "web" &&
    parts[2].toLowerCase() === "status"
  ) {
    // Web link: /i/web/status/{id}
    username = "i";
    tweetId = parts[3];
  } else {
    return null;
  }

  if (!/^\d{1,22}$/.test(tweetId)) {
    return null;
  }

  const isWebUser = username === "i";
  if (!isWebUser && !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return null;
  }

  const canonicalUrl = isWebUser
    ? `https://x.com/i/web/status/${tweetId}`
    : `https://x.com/${username}/status/${tweetId}`;

  return {
    tweetId,
    username: isWebUser ? "" : username,
    canonicalUrl,
    originalUrl: rawUrl.trim(),
  };
}

function unquoteCsvCell(cell: string): string {
  const trimmed = cell.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(unquoteCsvCell(current));
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(unquoteCsvCell(current));
  return cells;
}

export function parseXLinks(
  rawInput: string,
  existingTweetIds: Set<string> = new Set()
): ParseLinksResult {
  const entries: ParsedLinkEntry[] = [];
  const seenInBatch = new Set<string>();
  let duplicateCount = 0;
  let ignoredCount = 0;

  const lines = rawInput.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip CSV header rows cleanly
    if (/^(url|link|post_url|tweet_url)\s*[,|\t]/i.test(line)) {
      continue;
    }

    // Check inline comment separators: pipe, tab, or CSV row
    let inlineMatched = false;
    for (const sep of ["|", "\t"]) {
      const idx = line.indexOf(sep);
      if (idx > 0) {
        const left = unquoteCsvCell(line.slice(0, idx));
        const right = unquoteCsvCell(line.slice(idx + 1));
        const normalized = normalizeXStatusUrl(left);
        if (normalized) {
          inlineMatched = true;
          if (
            existingTweetIds.has(normalized.tweetId) ||
            seenInBatch.has(normalized.tweetId)
          ) {
            duplicateCount += 1;
          } else {
            seenInBatch.add(normalized.tweetId);
            entries.push({
              ...normalized,
              inlineComment: right || undefined,
            });
          }
          break;
        }
      }
    }
    if (inlineMatched) continue;

    // Check CSV row `url, comment`
    if (line.includes(",")) {
      const cells = splitCsvRow(line);
      if (cells.length >= 2) {
        const normalized = normalizeXStatusUrl(cells[0]);
        if (normalized) {
          const restComment = cells.slice(1).join(", ").trim();
          if (
            existingTweetIds.has(normalized.tweetId) ||
            seenInBatch.has(normalized.tweetId)
          ) {
            duplicateCount += 1;
          } else {
            seenInBatch.add(normalized.tweetId);
            entries.push({
              ...normalized,
              inlineComment: restComment || undefined,
            });
          }
          continue;
        }
      }
    }

    // Otherwise extract all X status URLs appearing anywhere on the line
    // (Strip stray WhatsApp/Telegram markdown characters like * or ` before matching)
    const sanitizedLine = line.replace(/[*`~]+/g, "");
    STATUS_URL_REGEX.lastIndex = 0;
    const matches = sanitizedLine.match(STATUS_URL_REGEX);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        const normalized = normalizeXStatusUrl(match);
        if (!normalized) {
          ignoredCount += 1;
          continue;
        }
        if (
          existingTweetIds.has(normalized.tweetId) ||
          seenInBatch.has(normalized.tweetId)
        ) {
          duplicateCount += 1;
        } else {
          seenInBatch.add(normalized.tweetId);
          entries.push(normalized);
        }
      }
    } else if (/https?:\/\/|\S+\.\S+/i.test(sanitizedLine)) {
      ignoredCount += 1;
    }
  }

  return { entries, duplicateCount, ignoredCount };
}

export function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "...",
  };

  return text
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|#39);/gi,
      (entity) => named[entity.toLowerCase()] ?? entity
    )
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : _;
    });
}

export function extractPostDetailsFromOembedHtml(html: string): {
  postText: string;
  postDate: string;
} {
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  let postText = "";

  if (pMatch) {
    const rawInner = pMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/([^\s>])(<a[^>]*>https?:\/\/)/gi, "$1 $2")
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
      .replace(/<[^>]+>/g, "");

    postText = decodeHtmlEntities(rawInner)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Trailing status anchor holds the post date: <a href="...status/...">March 21, 2006</a>
  const anchorMatches = [...html.matchAll(/<a[^>]*href="[^"]*\/status\/\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
  const lastAnchor = anchorMatches[anchorMatches.length - 1];
  const postDate = lastAnchor
    ? decodeHtmlEntities(lastAnchor[1].replace(/<[^>]+>/g, "")).trim()
    : "";

  return { postText, postDate };
}

export function extractHandleFromAuthorUrl(authorUrl?: string): string {
  if (!authorUrl) return "";
  try {
    const parsed = new URL(authorUrl);
    const first = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_]{1,15}$/.test(first) ? first : "";
  } catch {
    return "";
  }
}

export function buildXReplyIntentUrl(
  tweetId: string,
  commentText: string
): string {
  const params = new URLSearchParams();
  params.set("in_reply_to", tweetId);
  if (commentText.trim()) {
    params.set("text", commentText.trim());
  }
  return `https://x.com/intent/tweet?${params.toString()}`;
}

export function buildXPostUrl(username: string, tweetId: string): string {
  if (username && username !== "i") {
    return `https://x.com/${username}/status/${tweetId}`;
  }
  return `https://x.com/i/web/status/${tweetId}`;
}

export function extractTopicSnippet(postText: string): string {
  const cleaned = postText
    .replace(/https?:\/\/\S+/g, "")
    .replace(/pic\.twitter\.com\/\S+/g, "")
    .replace(/@[A-Za-z0-9_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "this post";

  // Prefer hashtags or meaningful words
  const hashtagMatch = cleaned.match(/#([A-Za-z0-9_]{3,24})/);
  if (hashtagMatch) {
    return hashtagMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  const words = cleaned
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()));

  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`.toLowerCase();
  }
  if (words.length === 1) {
    return words[0].toLowerCase();
  }

  return cleaned.slice(0, 32).trim();
}

export function truncateAtWordBoundary(text: string, maxLen = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return `${sliced.slice(0, lastSpace).trim()}…`;
  }
  return `${sliced.trim()}…`;
}

export function applyTemplateVariables(
  template: string,
  item: Pick<QueueItem, "authorName" | "authorHandle" | "username" | "postText">
): string {
  const firstName =
    item.authorName?.trim().split(/\s+/)[0] ||
    item.authorHandle ||
    item.username ||
    "there";
  const handle = item.authorHandle || item.username || "";
  const handleTag = handle ? `@${handle}` : firstName;
  const topic = extractTopicSnippet(item.postText || "");
  const snippet = (item.postText || "")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .slice(0, 60);

  return truncateAtWordBoundary(
    template
      .replace(/\{author\}/gi, firstName)
      .replace(/\{handle\}/gi, handleTag)
      .replace(/\{topic\}/gi, topic)
      .replace(/\{snippet\}/gi, snippet || "this"),
    280
  );
}

type PostIntentKind = "question" | "launch" | "guide" | "reflection" | "short";

function detectPostIntentKind(postText: string): PostIntentKind {
  const lower = postText.toLowerCase().trim();
  if (!lower || lower.length < 24) return "short";
  if (
    lower.includes("?") ||
    /^(how|what|why|which|anyone|would you|do you)\b/.test(lower)
  ) {
    return "question";
  }
  if (
    /\b(launch|launched|launching|ship|shipped|shipping|release|released|introducing|announce|live now|v1|v2|beta|built)\b/.test(
      lower
    )
  ) {
    return "launch";
  }
  if (
    /\b(thread|guide|steps|tips|lessons|playbook|checklist|how to|bookmark|1\/)\b/.test(
      lower
    ) ||
    lower.includes("🧵")
  ) {
    return "guide";
  }
  return "reflection";
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const OFFLINE_BANK: Record<ReplyTone, Record<PostIntentKind, string[]>> = {
  supportive: {
    launch: [
      "Congrats on shipping this, {author}! Big milestone — excited to see people put {topic} to work.",
      "Love seeing this go live, {author}. Clean execution on {topic}, wishing you a strong rollout!",
      "Huge congrats on the launch! Always inspiring to watch folks ship real work around {topic}.",
      "This looks super promising, {author}. Props for getting {topic} out the door!",
    ],
    guide: [
      "Really helpful breakdown on {topic}, {author}. Saved this to revisit carefully.",
      "Clean, practical notes here — especially your framing around {topic}. Appreciate you sharing!",
      "One of the clearest takes on {topic} I've seen this week. Thanks for putting it together, {author}.",
      "Super useful checklist, {author}. Simple insights like this on {topic} save people hours.",
    ],
    question: [
      "Great question on {topic}, {author} — curious to read everyone's perspective in the replies.",
      "This is something more people should think through regarding {topic}. Following the answers here!",
      "Honestly depends on the goal, though keeping {topic} simple early on usually wins.",
      "Glad you brought up {topic}, {author}. It sparks a really practical discussion.",
    ],
    reflection: [
      "Spot on, {author}. The perspective on {topic} here is something a lot of people overlook.",
      "Strongly agree with this take on {topic}. Consistency really compounds over time.",
      "Needed to read this today, {author}. Appreciate how clearly you framed {topic}!",
      "Really resonates — especially the point around {topic}. Well said.",
    ],
    short: [
      "Love this energy, {author} — appreciate you sharing!",
      "Clean and straight to the point. Well said, {author}!",
      "Right on target with this one, {author}.",
      "Always appreciate seeing your updates on the timeline, {author}!",
    ],
  },
  insightful: {
    launch: [
      "Nice release, {author}. The real differentiator with {topic} is how fast users hit their first win — looks like you nailed the focus.",
      "Congrats on shipping! Keeping scope tight around {topic} makes adoption way smoother early on.",
      "Strong launch, {author}. Solving the friction inside {topic} directly is usually what drives word of mouth.",
    ],
    guide: [
      "Great breakdown on {topic}. Most people overcomplicate step one, so keeping the workflow tight here makes a huge difference.",
      "The nuance you pointed out on {topic} is key — execution beats theory every single time.",
      "Solid framework, {author}. Having a repeatable loop for {topic} is where real leverage comes from.",
    ],
    question: [
      "With {topic}, the biggest unlock is usually removing manual steps first before optimizing anything else.",
      "In my view, {topic} comes down to balancing speed now with maintainability later — curious where you lean, {author}?",
      "Often the bottleneck in {topic} isn't tooling, it's clarity on the outcome. Great prompt!",
    ],
    reflection: [
      "Underrated point on {topic}. Once you simplify the core loop, everything else gets easier to scale.",
      "This holds true across almost every project: getting {topic} right early prevents headaches later.",
      "So true, {author}. People focus on flashy tactics, yet fundamentals like {topic} do the heavy lifting.",
    ],
    short: [
      "Simple observation, huge truth — fundamentals always win out.",
      "Concise take that gets straight to the heart of it, {author}.",
      "Worth bookmarking for the reminder alone.",
    ],
  },
  curious: {
    launch: [
      "Congrats on getting this live, {author}! What was the trickiest part of building {topic}?",
      "Looks super clean! Who are you finding gets the most immediate value out of {topic} so far?",
      "Awesome launch, {author}. What inspired you to tackle {topic} first?",
    ],
    guide: [
      "Great walkthrough on {topic}, {author}! Which step do people tend to trip up on most?",
      "Really clear breakdown — how long did it take you to dial in this approach to {topic}?",
      "Saved this! Out of everything around {topic}, what moved the needle fastest for you?",
    ],
    question: [
      "Interesting question on {topic} — which option have you seen work best in practice, {author}?",
      "Curious what pushed you to explore {topic} right now? Lots of interesting tradeoffs here.",
      "Good question! Are you optimizing more for speed or reliability on {topic}?",
    ],
    reflection: [
      "Really interesting perspective on {topic}, {author}. How did you first arrive at that takeaway?",
      "Makes a lot of sense — has your view on {topic} changed much over the past year?",
      "Love this angle on {topic}. Do you see this trend accelerating even more soon?",
    ],
    short: [
      "Curious to hear the backstory behind this, {author}!",
      "What got you thinking about this today, {author}?",
      "Interesting — would love to hear more detail on how you approach this!",
    ],
  },
  builder: {
    launch: [
      "Shipped! Congrats {author} — love seeing builders put real tools around {topic} into users' hands.",
      "Nothing beats the feeling of shipping {topic} to prod. Wishing you tons of early feedback, {author}!",
      "Clean ship, {author}! Keeping momentum high on {topic} is how real products get built.",
    ],
    guide: [
      "Practical builder notes on {topic} — way better than generic theory. Appreciate the share, {author}!",
      "Keeping this in the playbook. Real-world lessons from working on {topic} are gold.",
      "Every builder runs into {topic} eventually — glad you documented what actually works.",
    ],
    question: [
      "For {topic}, I'd bias toward the simplest stack that lets you test with real users this week.",
      "Classic builder tradeoff on {topic} — ship the lean version first, refine once feedback rolls in.",
      "Good question for builders here. Curious what workflow you're leaning toward on {topic}!",
    ],
    reflection: [
      "100% builder truth here on {topic}. Shipping consistently teaches you more than planning forever.",
      "This is the real work behind {topic} that doesn't get talked about enough. Keep building, {author}!",
      "Respect the discipline behind {topic} — small daily iterations really add up.",
    ],
    short: [
      "Keep shipping, {author} — consistency always pays off!",
      "Real builder energy right here.",
      "Respect the craft, {author}. Back to building!",
    ],
  },
  casual: {
    launch: [
      "Huge congrats on the launch, {author}! Looks super clean.",
      "W! Excited to try this out, {author}.",
      "Nice ship on {topic}! Love to see it.",
    ],
    guide: [
      "Bookmarked! Super clean notes on {topic}.",
      "Needed this breakdown on {topic}, thanks {author}!",
      "Straight to the point and actually useful. Appreciate it!",
    ],
    question: [
      "Honestly a great question — following the replies on this one.",
      "Curious to see where people land on {topic} here!",
      "Solid question, {author}. Definitely worth thinking about.",
    ],
    reflection: [
      "Real talk on {topic}. Couldn't agree more.",
      "100% this. More people need to hear it!",
      "Facts, {author}. Well put.",
    ],
    short: [
      "Love this, {author}!",
      "100% agreed.",
      "Clean take!",
    ],
  },
};

export function generateSmartOfflineReply(
  item: Pick<
    QueueItem,
    "tweetId" | "authorName" | "authorHandle" | "username" | "postText"
  >,
  options: {
    tone: ReplyTone;
    customAngle?: string;
    batchIndex?: number;
    usedComments?: Set<string>;
  }
): string {
  const kind = detectPostIntentKind(item.postText || "");
  const pool = OFFLINE_BANK[options.tone][kind];
  const seed = hashSeed(`${item.tweetId}:${options.batchIndex ?? 0}`);

  let chosen = "";
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = applyTemplateVariables(
      pool[(seed + offset) % pool.length],
      item
    );
    const normalized = candidate.toLowerCase();
    if (!options.usedComments || !options.usedComments.has(normalized)) {
      chosen = candidate;
      break;
    }
  }

  if (!chosen) {
    chosen = applyTemplateVariables(pool[seed % pool.length], item);
  }

  const angle = options.customAngle?.trim();
  if (angle) {
    const combined = `${chosen} ${angle}`;
    chosen = truncateAtWordBoundary(combined, 280);
  }

  if (options.usedComments) {
    options.usedComments.add(chosen.toLowerCase());
  }

  return chosen;
}

export function findDuplicateCommentIds(items: QueueItem[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const item of items) {
    const normalized = item.comment.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) continue;
    const list = seen.get(normalized) ?? [];
    list.push(item.id);
    seen.set(normalized, list);
  }

  const dupes = new Set<string>();
  for (const ids of seen.values()) {
    if (ids.length > 1) {
      for (const id of ids) dupes.add(id);
    }
  }
  return dupes;
}

export function buildBatchChatGptPrompt(
  items: QueueItem[],
  tone: ReplyTone,
  customAngle: string
): string {
  const toneLabel: Record<ReplyTone, string> = {
    supportive: "Supportive, warm, encouraging",
    insightful: "Insightful, thoughtful, value-adding",
    curious: "Curious, asks a sharp relevant question",
    builder: "Builder / creator peer perspective",
    casual: "Short, casual, conversational",
  };

  const lines: string[] = [
    `Write 1 unique, natural human X (Twitter) reply for each post below.`,
    `Tone: ${toneLabel[tone]}.`,
    customAngle.trim() ? `Extra instruction: ${customAngle.trim()}` : "",
    `Rules:`,
    `- Keep each reply under 220 characters and completely natural (no spam, no hashtags unless natural, no repeating the exact same opener).`,
    `- Return ONLY a numbered list matching the numbers below (e.g. "1. Your reply here").`,
    ``,
    `Posts:`,
  ].filter(Boolean);

  items.forEach((item, idx) => {
    const author = item.authorHandle
      ? `@${item.authorHandle}`
      : item.username
      ? `@${item.username}`
      : "author";
    const text = item.postText
      ? item.postText.replace(/\s+/g, " ").slice(0, 260)
      : `(Post URL: ${item.canonicalUrl})`;
    lines.push(`${idx + 1}. ${author}: "${text}"`);
  });

  return lines.join("\n");
}

export function parseBatchRepliesInput(
  rawText: string,
  expectedCount: number
): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const numbered = new Map<number, string>();
  const plain: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(?:\[?(\d{1,3})\]?[.)\-:]\s+)(.+)$/);
    if (match) {
      const idx = Number.parseInt(match[1], 10) - 1;
      const cleaned = match[2].replace(/^["']|["']$/g, "").trim();
      if (idx >= 0 && idx < expectedCount) {
        numbered.set(idx, truncateAtWordBoundary(cleaned, 280));
        continue;
      }
    }
    plain.push(truncateAtWordBoundary(line.replace(/^[-*•]\s+/, ""), 280));
  }

  if (numbered.size > 0) {
    const result: string[] = [];
    for (let i = 0; i < expectedCount; i += 1) {
      result.push(numbered.get(i) ?? plain[i] ?? "");
    }
    return result;
  }

  return plain.slice(0, expectedCount);
}

export function exportQueueToCsv(items: QueueItem[]): string {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "status",
    "url",
    "author_handle",
    "author_name",
    "post_text",
    "comment",
    "reply_intent_url",
  ];
  const rows = items.map((item) =>
    [
      item.status,
      item.canonicalUrl,
      item.authorHandle || item.username,
      item.authorName,
      item.postText,
      item.comment,
      buildXReplyIntentUrl(item.tweetId, item.comment),
    ]
      .map(escape)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function escapeJsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function exportQueueToStandaloneHtml(items: QueueItem[]): string {
  const compactSeed = items.map((item) => ({
    id: item.id,
    tweetId: item.tweetId,
    username: item.username,
    canonicalUrl: item.canonicalUrl,
    authorName: item.authorName,
    authorHandle: item.authorHandle,
    postText: item.postText,
    postDate: item.postDate,
    comment: item.comment,
    status: item.status,
  }));

  const seedHash = Math.abs(
    hashSeed(compactSeed.map((i) => `${i.tweetId}:${i.status}`).join("|"))
  ).toString(36);
  const safeJson = escapeJsonForHtmlScript(compactSeed);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>X ReplyFlow — Standalone Session Runner (${items.length} Posts)</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #020617;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .wrap { max-width: 940px; margin: 0 auto; padding: 20px 16px 60px; }
    .topbar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #1e293b; margin-bottom: 20px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 36px; height: 36px; border-radius: 10px; background: #0ea5e9; color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px;
    }
    .title { font-size: 16px; font-weight: 700; color: #fff; margin: 0; }
    .sub { font-size: 12px; color: #94a3b8; margin: 0; }
    .pill {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px;
      border-radius: 999px; background: #0f172a; border: 1px solid #1e293b; font-size: 12px; font-weight: 600;
    }
    .card {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; margin-bottom: 20px;
    }
    .runner-card { border-color: #0369a1; }
    .card-head {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 18px; background: #0b1324; border-bottom: 1px solid #1e293b;
    }
    .badge {
      display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;
    }
    .badge-sky { background: #0ea5e9; color: #fff; }
    .badge-green { background: #064e3b; color: #6ee7b7; }
    .badge-amber { background: #451a03; color: #fcd34d; }
    .badge-slate { background: #1e293b; color: #cbd5e1; }
    .card-body { padding: 18px; }
    .post-box {
      background: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 14px; margin-bottom: 14px;
    }
    .post-meta {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;
    }
    .post-text { white-space: pre-wrap; font-size: 14px; color: #e2e8f0; margin: 0; }
    textarea {
      width: 100%; border-radius: 12px; border: 1px solid #334155; background: #020617;
      color: #fff; padding: 10px 12px; font-family: inherit; font-size: 14px; resize: vertical;
    }
    textarea:focus { outline: none; border-color: #0ea5e9; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 16px; border-radius: 12px; border: 1px solid transparent;
      font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: opacity .15s;
    }
    .btn:hover { opacity: .9; }
    .btn-primary { flex: 1 1 220px; background: #0ea5e9; color: #fff; }
    .btn-green { background: #059669; color: #fff; }
    .btn-ghost { background: #1e293b; color: #cbd5e1; border-color: #334155; }
    .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
    .row { padding: 16px 18px; border-top: 1px solid #1e293b; }
    .row.done { opacity: .7; background: rgba(6, 78, 59, .12); }
    .row-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .filters { display: flex; flex-wrap: wrap; gap: 6px; }
    .muted { color: #94a3b8; font-size: 12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <div class="logo">𝕏</div>
        <div>
          <h1 class="title">X ReplyFlow — Standalone Runner</h1>
          <p class="sub">Runs directly in your browser tab. Opens your logged-in X account with pre-filled replies.</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div class="pill" id="stats-pill">0 done • 0 left</div>
        <button type="button" class="btn btn-ghost btn-sm" id="export-csv-btn">Export CSV</button>
      </div>
    </header>

    <div id="runner-root"></div>

    <section class="card">
      <div class="card-head">
        <strong style="font-size:14px;">All Queued Posts (<span id="total-count">0</span>)</strong>
        <div class="filters" id="filter-bar"></div>
      </div>
      <div id="list-root"></div>
    </section>
  </div>

  <script id="seed-data" type="application/json">${safeJson}</script>
  <script>
    (function () {
      var STORAGE_KEY = "x_replyflow_standalone_${seedHash}";
      var seed = JSON.parse(document.getElementById("seed-data").textContent || "[]");
      var items = seed;
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          var parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === seed.length) items = parsed;
        }
      } catch (e) {}

      var filter = "all";
      var lastOpenedAt = 0;
      var paceSeconds = 20;

      function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
      }

      function buildIntentUrl(tweetId, comment) {
        var p = new URLSearchParams();
        p.set("in_reply_to", tweetId);
        if (comment && comment.trim()) p.set("text", comment.trim());
        return "https://x.com/intent/tweet?" + p.toString();
      }

      function escapeHtml(str) {
        return String(str || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(function(){});
        }
      }

      function getPaceRemaining() {
        if (!lastOpenedAt) return 0;
        var elapsed = Math.floor((Date.now() - lastOpenedAt) / 1000);
        return Math.max(0, paceSeconds - elapsed);
      }

      function renderStats() {
        var done = items.filter(function (i) { return i.status === "done"; }).length;
        var left = items.filter(function (i) { return i.status === "pending" || i.status === "opened"; }).length;
        document.getElementById("stats-pill").innerHTML =
          '<span style="color:#34d399">' + done + ' done</span> • <span style="color:#38bdf8">' + left + ' left</span>';
        document.getElementById("total-count").textContent = String(items.length);
      }

      function renderFilters() {
        var counts = {
          all: items.length,
          pending: items.filter(function (i) { return i.status === "pending"; }).length,
          opened: items.filter(function (i) { return i.status === "opened"; }).length,
          done: items.filter(function (i) { return i.status === "done"; }).length,
          skipped: items.filter(function (i) { return i.status === "skipped"; }).length
        };
        var bar = document.getElementById("filter-bar");
        bar.innerHTML = ["all", "pending", "opened", "done", "skipped"].map(function (k) {
          var active = filter === k;
          return '<button type="button" data-filter="' + k + '" class="btn btn-sm ' +
            (active ? "btn-primary" : "btn-ghost") + '" style="flex:none">' +
            k.charAt(0).toUpperCase() + k.slice(1) + " (" + counts[k] + ")</button>";
        }).join("");
        bar.querySelectorAll("button").forEach(function (btn) {
          btn.onclick = function () { filter = btn.getAttribute("data-filter"); renderAll(); };
        });
      }

      function renderRunner() {
        var root = document.getElementById("runner-root");
        var active = items.find(function (i) { return i.status === "pending" || i.status === "opened"; });
        if (!active) {
          root.innerHTML = '<div class="card" style="padding:28px;text-align:center;border-color:#065f46;background:rgba(6,78,59,.2)">' +
            '<h2 style="margin:0 0 6px;color:#6ee7b7;font-size:16px;">All ' + items.length + ' posts processed!</h2>' +
            '<p class="muted" style="margin:0">You can export CSV above or reopen any item below.</p></div>';
          return;
        }
        var remaining = items.filter(function (i) { return i.status === "pending" || i.status === "opened"; }).length;
        var handle = active.authorHandle || active.username || "";
        var postUrl = handle ? ("https://x.com/" + handle + "/status/" + active.tweetId) : active.canonicalUrl;
        var pace = getPaceRemaining();
        var paceHtml = pace > 0
          ? '<span class="badge badge-amber" id="pace-badge">Suggested pace: ' + pace + 's</span>'
          : '<span class="badge badge-green" id="pace-badge">Natural pace ready</span>';

        root.innerHTML =
          '<div class="card runner-card">' +
            '<div class="card-head">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span class="badge badge-sky">Active Queue</span>' +
                '<span class="muted">' + remaining + ' remaining of ' + items.length + ' total</span>' +
              '</div>' +
              paceHtml +
            '</div>' +
            '<div class="card-body">' +
              '<div class="post-box">' +
                '<div class="post-meta">' +
                  '<div><strong>' + escapeHtml(active.authorName || ("@" + handle)) + '</strong> ' +
                    '<span class="muted">' + (handle ? "@" + escapeHtml(handle) : "") + (active.postDate ? " · " + escapeHtml(active.postDate) : "") + '</span></div>' +
                  '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(postUrl) + '" target="_blank" rel="noopener noreferrer">View Post ↗</a>' +
                '</div>' +
                '<p class="post-text">' + escapeHtml(active.postText || "(No preview text — reply link still targets this post.)") + '</p>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<span class="muted" style="font-weight:700;text-transform:uppercase;">Your Comment Draft</span>' +
                '<span class="mono muted" id="runner-chars">' + active.comment.length + '/280</span>' +
              '</div>' +
              '<textarea id="runner-textarea" rows="3">' + escapeHtml(active.comment) + '</textarea>' +
              '<div class="actions">' +
                '<a id="runner-open-x" class="btn btn-primary" href="' + escapeHtml(buildIntentUrl(active.tweetId, active.comment)) + '" target="_blank" rel="noopener noreferrer">1. Open Pre-filled Reply on X ↗</a>' +
                '<button type="button" id="runner-done" class="btn btn-green">2. Mark Done & Next</button>' +
                '<button type="button" id="runner-copy" class="btn btn-ghost">Copy</button>' +
                '<button type="button" id="runner-skip" class="btn btn-ghost">Skip</button>' +
              '</div>' +
            '</div>' +
          '</div>';

        var ta = document.getElementById("runner-textarea");
        var openA = document.getElementById("runner-open-x");
        var chars = document.getElementById("runner-chars");
        ta.oninput = function () {
          active.comment = ta.value;
          chars.textContent = ta.value.length + "/280";
          openA.href = buildIntentUrl(active.tweetId, ta.value);
          save();
          var listTa = document.querySelector('[data-ta="' + active.id + '"]');
          if (listTa) listTa.value = ta.value;
          var listOpen = document.querySelector('[data-open="' + active.id + '"]');
          if (listOpen) listOpen.href = buildIntentUrl(active.tweetId, ta.value);
        };
        openA.onclick = function () {
          copyText(active.comment);
          if (active.status !== "done") active.status = "opened";
          lastOpenedAt = Date.now();
          save();
          setTimeout(renderAll, 150);
        };
        document.getElementById("runner-done").onclick = function () {
          active.status = "done";
          save();
          renderAll();
        };
        document.getElementById("runner-skip").onclick = function () {
          active.status = "skipped";
          save();
          renderAll();
        };
        document.getElementById("runner-copy").onclick = function () {
          copyText(active.comment);
          this.textContent = "Copied!";
          var self = this;
          setTimeout(function () { self.textContent = "Copy"; }, 1200);
        };
      }

      function renderList() {
        var root = document.getElementById("list-root");
        var visible = items.filter(function (i) { return filter === "all" || i.status === filter; });
        if (!visible.length) {
          root.innerHTML = '<div style="padding:32px;text-align:center;" class="muted">No posts in this filter.</div>';
          return;
        }
        root.innerHTML = visible.map(function (item, idx) {
          var handle = item.authorHandle || item.username || "";
          var badgeClass = item.status === "done" ? "badge-green" : (item.status === "opened" ? "badge-sky" : "badge-slate");
          return '<div class="row ' + (item.status === "done" ? "done" : "") + '">' +
            '<div class="row-top">' +
              '<div><span class="mono muted">#' + (idx + 1) + '</span> <strong>' + escapeHtml(item.authorName || "@" + handle) + '</strong> ' +
                (handle ? '<span class="muted">@' + escapeHtml(handle) + '</span> ' : '') +
                '<span class="badge ' + badgeClass + '">' + escapeHtml(item.status) + '</span></div>' +
              '<a class="muted" href="' + escapeHtml(item.canonicalUrl) + '" target="_blank" rel="noopener noreferrer">Post ↗</a>' +
            '</div>' +
            (item.postText ? '<p class="muted" style="margin:0 0 8px;white-space:pre-wrap;">' + escapeHtml(item.postText.slice(0, 260)) + '</p>' : '') +
            '<textarea rows="2" data-ta="' + escapeHtml(item.id) + '">' + escapeHtml(item.comment) + '</textarea>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;justify-content:flex-end;">' +
              '<a class="btn btn-primary btn-sm" style="flex:none" data-open="' + escapeHtml(item.id) + '" href="' + escapeHtml(buildIntentUrl(item.tweetId, item.comment)) + '" target="_blank" rel="noopener noreferrer">Reply on X ↗</a>' +
              (item.status !== "done"
                ? '<button type="button" class="btn btn-green btn-sm" data-done="' + escapeHtml(item.id) + '">Done</button>'
                : '<button type="button" class="btn btn-ghost btn-sm" data-reopen="' + escapeHtml(item.id) + '">Reopen</button>') +
            '</div>' +
          '</div>';
        }).join("");

        items.forEach(function (item) {
          var ta = root.querySelector('[data-ta="' + item.id + '"]');
          var openA = root.querySelector('[data-open="' + item.id + '"]');
          if (ta) {
            ta.oninput = function () {
              item.comment = ta.value;
              if (openA) openA.href = buildIntentUrl(item.tweetId, ta.value);
              save();
            };
          }
          if (openA) {
            openA.onclick = function () {
              copyText(item.comment);
              if (item.status !== "done") item.status = "opened";
              lastOpenedAt = Date.now();
              save();
              setTimeout(renderAll, 150);
            };
          }
          var doneB = root.querySelector('[data-done="' + item.id + '"]');
          if (doneB) doneB.onclick = function () { item.status = "done"; save(); renderAll(); };
          var reopenB = root.querySelector('[data-reopen="' + item.id + '"]');
          if (reopenB) reopenB.onclick = function () { item.status = "pending"; save(); renderAll(); };
        });
      }

      function renderAll() {
        renderStats();
        renderFilters();
        renderRunner();
        renderList();
      }

      document.getElementById("export-csv-btn").onclick = function () {
        var esc = function (v) { return '"' + String(v || "").replace(/"/g, '""') + '"'; };
        var rows = ["status,url,handle,comment,reply_intent_url"].concat(items.map(function (i) {
          return [i.status, i.canonicalUrl, i.authorHandle || i.username, i.comment, buildIntentUrl(i.tweetId, i.comment)].map(esc).join(",");
        }));
        var blob = new Blob([rows.join("\\n")], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "x-replyflow-results.csv"; a.click();
        URL.revokeObjectURL(url);
      };

      setInterval(function () {
        var badge = document.getElementById("pace-badge");
        if (!badge) return;
        var pace = getPaceRemaining();
        if (pace > 0) {
          badge.className = "badge badge-amber";
          badge.textContent = "Suggested pace: " + pace + "s";
        } else {
          badge.className = "badge badge-green";
          badge.textContent = "Natural pace ready";
        }
      }, 1000);

      renderAll();
    })();
  </script>
</body>
</html>`;
}
