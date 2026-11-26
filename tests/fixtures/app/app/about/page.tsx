import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";

async function About({ theme }: { theme?: string }) {
  "use cache";
  cacheLife("days");
  cacheTag("about");
  return <main data-theme={theme}>About</main>;
}

export default async function Page() {
  const theme = (await cookies()).get("theme")?.value;
  return <About theme={theme} />;
}
