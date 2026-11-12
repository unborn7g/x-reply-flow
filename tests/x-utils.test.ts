import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTemplateVariables,
  buildBatchChatGptPrompt,
  buildXReplyIntentUrl,
  exportQueueToCsv,
  exportQueueToStandaloneHtml,
  extractHandleFromAuthorUrl,
  extractPostDetailsFromOembedHtml,
  findDuplicateCommentIds,
  generateSmartOfflineReply,
  normalizeXStatusUrl,
  parseBatchRepliesInput,
  parseXLinks,
} from "../src/lib/x-utils";
import type { QueueItem } from "../src/lib/types";

test("normalizeXStatusUrl handles x.com, twitter.com, fxtwitter, mobile, query params, and /photo/1", () => {
  const a = normalizeXStatusUrl("https://x.com/jack/status/20?s=20&t=xyz");
  assert.equal(a?.tweetId, "20");
  assert.equal(a?.username, "jack");
  assert.equal(a?.canonicalUrl, "https://x.com/jack/status/20");

  const b = normalizeXStatusUrl(
    "https://mobile.twitter.com/nextjs/status/2107579978854645875/photo/1"
  );
  assert.equal(b?.tweetId, "2107579978854645875");
  assert.equal(b?.username, "nextjs");
  assert.equal(
    b?.canonicalUrl,
    "https://x.com/nextjs/status/2107579978854645875"
  );

  const c = normalizeXStatusUrl("fxtwitter.com/vercel/status/123456789");
  assert.equal(c?.canonicalUrl, "https://x.com/vercel/status/123456789");

  const web = normalizeXStatusUrl("https://x.com/i/web/status/999888777");
  assert.equal(web?.tweetId, "999888777");
  assert.equal(web?.username, "");
  assert.equal(web?.canonicalUrl, "https://x.com/i/web/status/999888777");

  assert.equal(normalizeXStatusUrl("https://x.com/explore"), null);
  assert.equal(normalizeXStatusUrl("https://example.com/status/123"), null);

  const whatsapp = normalizeXStatusUrl(
    "*x.com/*b3trance/status/2120931498765254711"
  );
  assert.equal(whatsapp?.tweetId, "2120931498765254711");
  assert.equal(whatsapp?.username, "b3trance");
  assert.equal(
    whatsapp?.canonicalUrl,
    "https://x.com/b3trance/status/2120931498765254711"
  );
});

test("parseXLinks handles raw WhatsApp/Telegram bot dumps cleanly", () => {
  const dump = `[12/11/2026 18:26] 𝐀𝐏𝐄 𝐁𝐎𝐓 💹: #768 HannahKrypt  
x.com/HannahKrypt/status/2120922709316063355  
[12/11/2026 18:30] 𝐀𝐏𝐄 𝐁𝐎𝐓 💹: #773  
VIP ★  
x.com/x/status/2120932226615435685  
[12/11/2026 18:43] 𝐀𝐏𝐄 𝐁𝐎𝐓 💹: #795 *b3trance*  
*x.com/*b3trance/status/2120931498765254711`;

  const res = parseXLinks(dump);
  assert.equal(res.entries.length, 3);
  assert.equal(res.ignoredCount, 0);
  assert.equal(res.duplicateCount, 0);
  assert.equal(res.entries[2].username, "b3trance");
  assert.equal(res.entries[2].tweetId, "2120931498765254711");
});

test("parseXLinks extracts mixed links, CSV comments, deduplicates, and counts invalid lines", () => {
  const input = `
url,comment
https://x.com/jack/status/20
"https://twitter.com/nextjs/status/2107579978854645875","Love Next.js 16.4!"
https://x.com/jack/status/20
https://x.com/explore
https://x.com/vercel/status/555666777 | Shipping fast!
`;
  const existing = new Set(["999999"]);
  const res = parseXLinks(input, existing);

  assert.equal(res.entries.length, 3);
  assert.equal(res.duplicateCount, 1);
  assert.equal(res.ignoredCount, 1);
  assert.equal(res.entries[0].tweetId, "20");
  assert.equal(res.entries[1].inlineComment, "Love Next.js 16.4!");
  assert.equal(res.entries[2].inlineComment, "Shipping fast!");
});

test("extractPostDetailsFromOembedHtml decodes entities, preserves newlines, separates t.co links, and extracts date", () => {
  const sampleHtml = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Next.js 16.4 &amp; more<br><br>• Smaller bundles<a href="https://t.co/3SE5yL6Mj7">https://t.co/3SE5yL6Mj7</a></p>&mdash; Next.js (@nextjs) <a href="https://x.com/nextjs/status/2107579978854645875?ref_src=twsrc%5Etfw">October 6, 2026</a></blockquote>`;
  const details = extractPostDetailsFromOembedHtml(sampleHtml);

  assert.equal(
    details.postText,
    "Next.js 16.4 & more\n\n• Smaller bundles https://t.co/3SE5yL6Mj7"
  );
  assert.equal(details.postDate, "October 6, 2026");
  assert.equal(extractHandleFromAuthorUrl("https://x.com/nextjs"), "nextjs");
});

test("buildXReplyIntentUrl builds valid official X intent URL", () => {
  const url = buildXReplyIntentUrl("20", "Great milestone!");
  assert.equal(
    url,
    "https://x.com/intent/tweet?in_reply_to=20&text=Great+milestone%21"
  );
});

test("generateSmartOfflineReply produces unique contextual replies under 280 chars", () => {
  const used = new Set<string>();
  const r1 = generateSmartOfflineReply(
    {
      tweetId: "1001",
      authorName: "Next.js",
      authorHandle: "nextjs",
      username: "nextjs",
      postText: "We just launched Next.js 16.4 with faster builds!",
    },
    { tone: "supportive", batchIndex: 0, usedComments: used }
  );
  const r2 = generateSmartOfflineReply(
    {
      tweetId: "1002",
      authorName: "Next.js",
      authorHandle: "nextjs",
      username: "nextjs",
      postText: "We just launched our new Turbopack cache improvements!",
    },
    { tone: "supportive", batchIndex: 1, usedComments: used }
  );

  assert.ok(r1.length > 10 && r1.length <= 280);
  assert.ok(r2.length > 10 && r2.length <= 280);
  assert.notEqual(r1.toLowerCase(), r2.toLowerCase());
});

test("applyTemplateVariables substitutes placeholders cleanly", () => {
  const out = applyTemplateVariables(
    "Nice breakdown on {topic}, {author} ({handle})!",
    {
      authorName: "Abdul Basit",
      authorHandle: "unborn7g",
      username: "unborn7g",
      postText: "Building an automated Vercel workflow #buildinpublic",
    }
  );
  assert.equal(
    out,
    "Nice breakdown on buildinpublic, Abdul (@unborn7g)!"
  );
});

test("parseBatchRepliesInput parses numbered and bulleted replies accurately", () => {
  const parsed = parseBatchRepliesInput(
    `1. First awesome reply\n2) "Second clean reply"\n[3]: Third question?`,
    3
  );
  assert.deepEqual(parsed, [
    "First awesome reply",
    "Second clean reply",
    "Third question?",
  ]);
});

test("findDuplicateCommentIds and exportQueueToCsv work properly", () => {
  const base: QueueItem = {
    id: "id-1",
    tweetId: "20",
    username: "jack",
    canonicalUrl: "https://x.com/jack/status/20",
    originalInputUrl: "https://x.com/jack/status/20",
    authorName: "jack",
    authorHandle: "jack",
    postText: "just setting up my twttr",
    postDate: "March 21, 2006",
    fetchState: "ready",
    comment: "Classic moment!",
    status: "pending",
    createdAt: 1,
  };
  const second: QueueItem = { ...base, id: "id-2", tweetId: "21" };
  const third: QueueItem = {
    ...base,
    id: "id-3",
    tweetId: "22",
    comment: "Different comment",
  };

  const dupes = findDuplicateCommentIds([base, second, third]);
  assert.equal(dupes.has("id-1"), true);
  assert.equal(dupes.has("id-2"), true);
  assert.equal(dupes.has("id-3"), false);

  const prompt = buildBatchChatGptPrompt([base], "curious", "");
  assert.ok(prompt.includes("@jack"));
  assert.ok(prompt.includes("just setting up my twttr"));

  const csv = exportQueueToCsv([base]);
  assert.ok(csv.includes("reply_intent_url"));
  assert.ok(csv.includes("https://x.com/intent/tweet?in_reply_to=20"));

  const xssItem: QueueItem = {
    ...base,
    postText: "Hello </script><script>alert(1)</script>",
  };
  const html = exportQueueToStandaloneHtml([xssItem]);
  assert.ok(html.includes("X ReplyFlow — Standalone Runner"));
  assert.ok(html.includes("\\u003c/script\\u003e"));
  assert.equal(html.includes("</script><script>alert(1)"), false);
});
