import { cacheLife } from "next/cache";
import { cookies } from "next/headers";

async function Ticker() {
  "use cache";
  cacheLife("seconds");
  return <span>{Date.now()}</span>;
}

export default async function Page() {
  "use cache";
  const theme = (await cookies()).get("theme");
  return (
    <main data-theme={theme?.value}>
      <Ticker />
    </main>
  );
}
