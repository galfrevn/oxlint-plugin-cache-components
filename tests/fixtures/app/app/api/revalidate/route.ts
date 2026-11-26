import { revalidatePath, updateTag } from "next/cache";

export async function POST() {
  updateTag("posts");
  revalidatePath("/blog/[slug]");
  return Response.json({ ok: true });
}
