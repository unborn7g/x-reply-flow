import { NextRequest, NextResponse } from "next/server";
import {
  extractHandleFromAuthorUrl,
  extractPostDetailsFromOembedHtml,
  normalizeXStatusUrl,
} from "@/lib/x-utils";

export const runtime = "nodejs";

interface OembedApiResult {
  tweetId: string;
  canonicalUrl: string;
  authorName: string;
  authorHandle: string;
  postText: string;
  postDate: string;
  ok: boolean;
  error?: string;
}

async function fetchSingleOembed(rawUrl: string): Promise<OembedApiResult> {
  const normalized = normalizeXStatusUrl(rawUrl);
  if (!normalized) {
    return {
      tweetId: "",
      canonicalUrl: rawUrl,
      authorName: "",
      authorHandle: "",
      postText: "",
      postDate: "",
      ok: false,
      error: "Invalid X post link",
    };
  }

  // Strictly construct official X oEmbed endpoint from validated status URL.
  // /i/web/status/{id} 404s on publish.x.com/oembed, whereas /x/status/{id} resolves the real author.
  const lookupUrl = normalized.canonicalUrl.includes("/i/web/status/")
    ? `https://x.com/x/status/${normalized.tweetId}`
    : normalized.canonicalUrl;

  const targetUrl = `https://publish.x.com/oembed?url=${encodeURIComponent(
    lookupUrl
  )}&omit_script=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "X-ReplyFlow/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        tweetId: normalized.tweetId,
        canonicalUrl: normalized.canonicalUrl,
        authorName: normalized.username ? `@${normalized.username}` : "",
        authorHandle: normalized.username,
        postText: "",
        postDate: "",
        ok: false,
        error:
          res.status === 404
            ? "Post not found or protected (you can still write a manual reply)"
            : `X oEmbed returned HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        tweetId: normalized.tweetId,
        canonicalUrl: normalized.canonicalUrl,
        authorName: normalized.username ? `@${normalized.username}` : "",
        authorHandle: normalized.username,
        postText: "",
        postDate: "",
        ok: false,
        error: "Post context unavailable (protected or unavailable)",
      };
    }

    const data = (await res.json()) as {
      url?: string;
      author_name?: string;
      author_url?: string;
      html?: string;
    };

    const handle =
      extractHandleFromAuthorUrl(data.author_url) || normalized.username;
    const { postText, postDate } = extractPostDetailsFromOembedHtml(
      data.html ?? ""
    );

    const resolvedUrl =
      handle && normalized.tweetId
        ? `https://x.com/${handle}/status/${normalized.tweetId}`
        : data.url || normalized.canonicalUrl;

    return {
      tweetId: normalized.tweetId,
      canonicalUrl: resolvedUrl,
      authorName: data.author_name?.trim() || (handle ? `@${handle}` : "X User"),
      authorHandle: handle,
      postText,
      postDate,
      ok: true,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      tweetId: normalized.tweetId,
      canonicalUrl: normalized.canonicalUrl,
      authorName: normalized.username ? `@${normalized.username}` : "",
      authorHandle: normalized.username,
      postText: "",
      postDate: "",
      ok: false,
      error: isAbort
        ? "Timed out fetching post preview"
        : "Could not reach X oEmbed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, Math.max(items.length, 1)) },
    () => next()
  );
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { urls?: unknown };
    if (!Array.isArray(body.urls) || body.urls.length === 0) {
      return NextResponse.json(
        { error: "Please provide a non-empty 'urls' array." },
        { status: 400 }
      );
    }

    const urls = body.urls
      .filter((u): u is string => typeof u === "string")
      .slice(0, 50);

    const results = await runWithConcurrency(urls, 4, fetchSingleOembed);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 }
    );
  }
}
