import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Machine endpoints authenticate themselves (LINE signature, CRON_SECRET).
const PUBLIC_PATHS = ["/login", "/api/line/webhook", "/api/cron"];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

// Header carrying the already-validated user's email forward to Server
// Components, so layouts/pages don't have to pay for a second round trip to
// Supabase Auth to re-derive what middleware just verified. Only ever set
// here, from claims `auth.getClaims()` itself verified — a request header of
// this name arriving from outside is always overwritten below (or stripped,
// when there's no verified user), so it can't be spoofed by a caller.
export const AUTH_USER_EMAIL_HEADER = "x-personal-crm-user-email";

export async function updateSession(request: NextRequest) {
  const cookiesToApply: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply.push(...cookiesToSet);
        },
      },
    },
  );

  // getClaims() verifies the access token's signature locally against the
  // project's asymmetric (ES256) JWT signing keys — the JWKS is fetched once
  // and cached per server instance — so the common case costs zero network
  // round trips. getUser() would instead call Supabase Auth on *every*
  // request, which was the single biggest per-navigation cost. An expired
  // token is still refreshed here (one call, roughly once an hour), and every
  // data query is independently enforced by RLS on the database side.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user = claims?.sub ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null } : null;

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(redirectUrl);
    cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  }

  if (user && pathname === "/login") {
    const response = NextResponse.redirect(new URL("/", request.url));
    cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  if (user?.email) {
    requestHeaders.set(AUTH_USER_EMAIL_HEADER, user.email);
  } else {
    requestHeaders.delete(AUTH_USER_EMAIL_HEADER);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
