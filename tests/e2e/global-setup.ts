import { build } from "tsdown";

export async function setup(): Promise<void> {
  await build({ logLevel: "silent", publint: false, attw: false });
}
