import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: bounce visitors without a session cookie to /login.
// The session itself is verified against the database in requireOwner().
const PUBLIC = ["/login", "/signup", "/pay", "/api/cron", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!req.cookies.get("pgm_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
