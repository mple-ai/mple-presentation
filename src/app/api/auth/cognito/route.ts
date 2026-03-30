import { signIn } from "@/server/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token } = (await req.json()) as { token: string };

  if (!token) {
    return NextResponse.json({ error: "No token" }, { status: 400 });
  }

  try {
    await signIn("credentials", { token, redirect: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("NEXT_REDIRECT")) {
      return NextResponse.json({ error: "Auth failed" }, { status: 401 });
    }
  }

  return NextResponse.json({ ok: true });
}
