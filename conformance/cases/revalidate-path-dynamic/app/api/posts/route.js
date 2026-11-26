import { revalidatePath } from "next/cache";

export async function POST() {
  revalidatePath("/blog/[slug]");
  return Response.json({ ok: true });
}
