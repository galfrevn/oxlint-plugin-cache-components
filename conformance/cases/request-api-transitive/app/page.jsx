import { cookies } from "next/headers";

async function readTheme() {
  return (await cookies()).get("theme")?.value;
}

async function Theme() {
  "use cache";
  return <p>{(await readTheme()) ?? "light"}</p>;
}

export default function Page() {
  return <Theme />;
}
