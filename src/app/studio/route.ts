/** The studio website is also a standalone, downloadable HTML application. */
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/studio/index.html" },
  });
}
