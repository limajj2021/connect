import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

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
// here, from a value `auth.getUser()` itself returned — a request header of
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
