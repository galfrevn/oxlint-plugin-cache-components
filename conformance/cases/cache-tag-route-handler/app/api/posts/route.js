import { cacheTag } from "next/cache";

export async function GET() {
  cacheTag("posts");
  return Response.json({ ok: true });
}
