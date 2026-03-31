import { auth } from "@/server/auth";
import { NextResponse, type NextRequest } from "next/server";

const log = (step: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({ step, ...data }));
};

export async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isDeniedPage = request.nextUrl.pathname.startsWith("/auth/denied");
  const token = request.nextUrl.searchParams.get("token");
  const presentationId = request.nextUrl.searchParams.get("presentationId");

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

    log("middleware:token_found", {
      port,
      authUrl: authUrl.toString(),
      hasExistingSession: !!session,
      existingCookies:
        request.headers
          .get("cookie")
          ?.split(";")
          .map((c) => c.trim().split("=")[0]) ?? [], // log cookie names only, not values
    });

    try {
      const authRes = await fetch(authUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(10000),
      });

      log("middleware:auth_response", {
        status: authRes.status,
        ok: authRes.ok,
        // Log cookie names and their flags, not values
        setCookies:
          authRes.headers.getSetCookie?.()?.map((c) => {
            const [nameVal, ...flags] = c.split(";");
            const name = nameVal?.split("=")[0]?.trim();
            return { name, flags: flags.map((f) => f.trim()) };
          }) ?? [],
      });

      if (!authRes.ok) {
        log("middleware:auth_failed", { status: authRes.status });
        return NextResponse.redirect(new URL("/auth/denied", request.url));
      }

      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("token");

      if (presentationId) {
        cleanUrl.pathname = `/presentation/${presentationId}`;
        cleanUrl.searchParams.delete("presentationId");
      }

      const res = NextResponse.redirect(cleanUrl);

      // Forward all cookies
      const setCookies = authRes.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookies) {
        res.headers.append("set-cookie", cookie);
      }

      log("middleware:redirecting", {
        to: cleanUrl.toString(),
        cookiesForwarded: setCookies.length,
      });

      return res;
    } catch (err) {
      log("middleware:fetch_error", {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : "Unknown",
        authUrl: authUrl.toString(),
      });
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
    log("middleware:unauthenticated", {
      pathname: request.nextUrl.pathname,
    });
    return NextResponse.redirect(new URL("/auth/denied", request.url));
  }

  // If session exists and we have a presentationId, redirect directly to the edit page
  if (
    session &&
    request.nextUrl.pathname === "/presentation" &&
    presentationId
  ) {
    const editUrl = request.nextUrl.clone();
    editUrl.pathname = `/presentation/${presentationId}`;
    editUrl.searchParams.delete("presentationId");
    return NextResponse.redirect(editUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
