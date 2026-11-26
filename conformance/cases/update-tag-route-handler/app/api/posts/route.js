import { updateTag } from "next/cache";

export async function POST() {
  updateTag("posts");
  return Response.json({ ok: true });
}
