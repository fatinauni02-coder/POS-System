// GET /api/v1/hello — the smallest API: answers with a little JSON
export async function GET() {
  return Response.json({ message: "Hello from Kopi & Co. API" });
}