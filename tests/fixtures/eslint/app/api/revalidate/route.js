import { revalidatePath, revalidateTag } from "next/cache";

export async function POST(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.REVALIDATE_TOKEN}`) {
    return new Response(null, { status: 401 });
  }
  revalidateTag("posts");
  revalidatePath("/blog/[slug]");
  return Response.json({ ok: true });
}
