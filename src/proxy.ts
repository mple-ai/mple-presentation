import { auth } from "@/server/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isDeniedPage = request.nextUrl.pathname.startsWith("/auth/denied");
  const hasToken = request.nextUrl.searchParams.has("token");

  // Always redirect from root to /presentation
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/presentation", request.url));
  }

  // If user is on auth page but already signed in, redirect to home page
  if (isAuthPage && !isDeniedPage && session) {
    return NextResponse.redirect(new URL("/presentation", request.url));
  }

  // Allow through if a cognito token is present — AuthBootstrap will handle auth
  if (hasToken) {
    return NextResponse.next();
  }

  // If user is not authenticated, show denied page (no Google login on this app)
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
