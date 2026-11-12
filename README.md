# X ReplyFlow — $0 X Comment & Reply Studio

A clean, free ($0) Next.js web studio for commenting on a list of X (Twitter) links using your own logged-in X account — ready to run locally or deploy to Vercel.

## How It Works (100% Free, Zero X API Billing)

1. **Paste X Post Links** (plain URLs, mixed text, `.txt`, or `url,comment` CSV).
2. **Source Post Context for Free:** Uses X's official public `publish.x.com/oembed` endpoint to fetch the post text, author name, `@handle`, and date — no X API key or credit card needed.
3. **Write or Generate Comments:**
   - **Smart Auto ($0 Built-in):** Generates varied, contextual replies locally based on post intent and your chosen tone.
   - **Your Comments / Templates:** Paste custom lists (1-to-1 or rotated) with dynamic variables like `{author}`, `{handle}`, `{topic}`.
   - **Free-Tier AI (Optional):** Supports free Google Gemini or Groq API keys (in browser Settings or Vercel env vars), plus a 1-click **ChatGPT / Gemini Batch Prompt Helper**.
4. **Reply on Your X Account in 1 Click:** Opens X's official Web Intent (`https://x.com/intent/tweet?in_reply_to=...&text=...`) pre-filled with your comment in your logged-in X session, tracks completion, and warns against duplicate comments or rapid-fire pacing.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Running Tests & Build Verification

```bash
npm test
npm run build
```

## Deploying to Vercel

### Option A: Vercel CLI (Fastest)
```bash
npx vercel --prod
```

### Option B: GitHub + Vercel Dashboard
1. Push this folder to a GitHub repository.
2. Import the repository in [Vercel](https://vercel.com/new) (Framework Preset: **Next.js**).
3. *(Optional)* Add `GEMINI_API_KEY` or `GROQ_API_KEY` in **Project Settings → Environment Variables** if you want server-wide AI generation enabled automatically.
4. Click **Deploy**.
