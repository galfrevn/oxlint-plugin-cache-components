"use server";

import { cacheTag, revalidateTag } from "next/cache";

export async function savePost(id: string) {
  cacheTag(`post-${id}`);
  revalidateTag("posts");
}
