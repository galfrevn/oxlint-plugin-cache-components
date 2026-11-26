import { cacheLife } from "next/cache";

async function Ticker() {
  "use cache";
  cacheLife("seconds");
  return <span>{Date.now()}</span>;
}

export default async function Page() {
  "use cache";
  return (
    <main>
      <Ticker />
    </main>
  );
}
