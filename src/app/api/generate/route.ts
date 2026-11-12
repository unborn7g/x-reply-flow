import { NextRequest, NextResponse } from "next/server";
import type { AiProvider, ReplyTone } from "@/lib/types";
import { truncateAtWordBoundary } from "@/lib/x-utils";

export const runtime = "nodejs";

interface GeneratePostInput {
  id: string;
  tweetId: string;
  authorName: string;
  authorHandle: string;
  postText: string;
  canonicalUrl: string;
}

interface GenerateRequestBody {
  posts?: GeneratePostInput[];
  tone?: ReplyTone;
  customAngle?: string;
  provider?: AiProvider;
  apiKey?: string;
  customBaseUrl?: string;
  customModel?: string;
}

function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const TONE_GUIDES: Record<ReplyTone, string> = {
  supportive: "Warm, supportive, genuine encouragement without sounding cheesy.",
  insightful: "Thoughtful, adds a concise useful perspective or sharp observation.",
  curious: "Friendly and curious; asks one specific follow-up question.",
  builder: "Peer builder/creator vibe; practical, grounded, appreciative of shipping.",
  casual: "Short, conversational, natural everyday X reply (6-16 words).",
};

function buildSystemAndUserPrompts(
  posts: GeneratePostInput[],
  tone: ReplyTone,
  customAngle: string
): { system: string; user: string } {
  const system = [
    "You write authentic, human-sounding replies to X (Twitter) posts.",
    `Style: ${TONE_GUIDES[tone] ?? TONE_GUIDES.supportive}`,
    customAngle.trim() ? `Extra instruction: ${customAngle.trim()}` : "",
    "Strict rules:",
    "- Write ONE unique reply per post ID.",
    "- Keep every reply strictly under 240 characters.",
    "- Never sound like a bot or spammer: avoid repetitive openers, avoid hashtag stuffing, avoid generic 'Great post!' filler.",
    "- Reference concrete details from each post when available.",
    '- Respond ONLY with valid JSON: {"replies":[{"id":"...","comment":"..."}]}',
  ]
    .filter(Boolean)
    .join("\n");

  const payload = posts.map((p) => ({
    id: p.id,
    author: p.authorHandle ? `@${p.authorHandle}` : p.authorName || "author",
    postText: p.postText
      ? p.postText.slice(0, 500)
      : `(No preview text fetched; URL is ${p.canonicalUrl})`,
  }));

  const user = `Generate replies for these ${posts.length} posts:\n${JSON.stringify(
    payload
  )}`;

  return { system, user };
}

function parseJsonReplies(
  rawText: string,
  expectedIds: Set<string>
): Array<{ id: string; comment: string }> {
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned) as {
    replies?: Array<{ id?: string; comment?: string }>;
  };

  if (!Array.isArray(parsed.replies)) {
    throw new Error("AI response missing 'replies' array");
  }

  return parsed.replies
    .filter(
      (r): r is { id: string; comment: string } =>
        typeof r.id === "string" &&
        expectedIds.has(r.id) &&
        typeof r.comment === "string" &&
        r.comment.trim().length > 0
    )
    .map((r) => ({
      id: r.id,
      comment: truncateAtWordBoundary(r.comment.trim(), 280),
    }));
}

async function callGemini(
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastErr = "Gemini request failed";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.75,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      lastErr = `Gemini (${model}) HTTP ${res.status}: ${errBody.slice(0, 180)}`;
      if (res.status === 404) continue;
      throw new Error(lastErr);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    return text;
  }

  throw new Error(lastErr);
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<string> {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const endpoint = normalizedBase.endsWith("/chat/completions")
    ? normalizedBase
    : `${normalizedBase}/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `AI endpoint returned HTTP ${res.status}: ${errBody.slice(0, 180)}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("AI endpoint returned an empty response");
  }
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateRequestBody;
    const posts = Array.isArray(body.posts) ? body.posts.slice(0, 25) : [];

    if (posts.length === 0) {
      return NextResponse.json(
        { error: "Provide at least 1 post to generate replies for." },
        { status: 400 }
      );
    }

    const tone: ReplyTone = body.tone ?? "supportive";
    const customAngle = body.customAngle ?? "";
    const provider: AiProvider = body.provider ?? "gemini";

    let rawResponse = "";
    const { system, user } = buildSystemAndUserPrompts(
      posts,
      tone,
      customAngle
    );

    if (provider === "gemini") {
      const key = body.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
      if (!key) {
        return NextResponse.json(
          {
            error:
              "No Gemini API key configured. Add a free Gemini key in Settings, or use the $0 Smart Auto / ChatGPT Helper tabs.",
          },
          { status: 400 }
        );
      }
      rawResponse = await callGemini(key, system, user);
    } else if (provider === "groq") {
      const key = body.apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || "";
      if (!key) {
        return NextResponse.json(
          {
            error:
              "No Groq API key configured. Add a free Groq key in Settings, or use the $0 Smart Auto / ChatGPT Helper tabs.",
          },
          { status: 400 }
        );
      }
      rawResponse = await callOpenAiCompatible(
        "https://api.groq.com/openai/v1",
        key,
        body.customModel?.trim() || "llama-3.3-70b-versatile",
        system,
        user
      );
    } else {
      const key = body.apiKey?.trim() || "";
      const base = body.customBaseUrl?.trim() || "";
      const model = body.customModel?.trim() || "gpt-4o-mini";
      if (!key || !base) {
        return NextResponse.json(
          {
            error:
              "Custom provider requires both an HTTPS Base URL and API key in Settings.",
          },
          { status: 400 }
        );
      }
      if (!isSafeHttpsUrl(base)) {
        return NextResponse.json(
          { error: "Custom AI Base URL must be a valid public HTTPS URL." },
          { status: 400 }
        );
      }
      rawResponse = await callOpenAiCompatible(base, key, model, system, user);
    }

    const expectedIds = new Set(posts.map((p) => p.id));
    const replies = parseJsonReplies(rawResponse, expectedIds);

    return NextResponse.json({ replies });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate AI replies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
