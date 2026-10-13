import { NextRequest, NextResponse } from "next/server";

/** The public studio deployment must not expose the separate SaaS workspace. */
export function proxy(req: NextRequest) {
  if (process.env.STUDIO_SITE_ONLY !== "true") return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (path === "/")
    return NextResponse.rewrite(new URL("/studio/index.html", req.url));
  if (
    path === "/studio" ||
    path.startsWith("/studio/") ||
    path === "/api/studio-enquiries" ||
    path === "/api/health" ||
    path.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }
  return new NextResponse("Not found", { status: 404 });
}
