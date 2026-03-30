import { auth } from "@/server/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isDeniedPage = request.nextUrl.pathname.startsWith("/auth/denied");
  const token = request.nextUrl.searchParams.get("token");

  // Always redirect from root to /presentation
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/presentation", request.url));
  }

  // If user is on auth page but already signed in, redirect to home page
  if (isAuthPage && !isDeniedPage && session) {
    return NextResponse.redirect(new URL("/presentation", request.url));
  }

  // If a cognito token is present -> handle auth here in middleware
  if (token) {
    const port = process.env.PORT ?? "3005";
    const authUrl = new URL("/api/auth/cognito", `http://localhost:${port}`);

    try {
      const authRes = await fetch(authUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward existing cookies so NextAuth can find any existing session
          cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ token }),
      });

      if (!authRes.ok) {
        return NextResponse.redirect(new URL("/auth/denied", request.url));
      }

      // Redirect to clean URL (strip token + keep language param)
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("token");

      const res = NextResponse.redirect(cleanUrl);

      // Forward the session cookie set by NextAuth back to the browser
      const setCookie = authRes.headers.get("set-cookie");
      if (setCookie) {
        res.headers.set("set-cookie", setCookie);
      }

      return res;
    } catch (err) {
      console.error("Middleware cognito auth failed:", err);
      return NextResponse.redirect(new URL("/auth/denied", request.url));
    }
  }

  // If user is not authenticated, show denied page
  if (
    !session &&
    !isAuthPage &&
    !isDeniedPage &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    return NextResponse.redirect(new URL("/auth/denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
