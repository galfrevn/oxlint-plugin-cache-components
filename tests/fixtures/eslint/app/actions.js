"use server";

import { cacheTag } from "next/cache";

export async function savePost(id) {
  cacheTag(`post-${id}`);
}
