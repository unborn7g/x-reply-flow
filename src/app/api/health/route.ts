import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    serverAi: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    },
  });
}
