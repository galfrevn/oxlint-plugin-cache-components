import { cookies } from "next/headers";
import { Suspense } from "react";

async function Prefs({ store }) {
  "use cache";
  const cookieStore = await store;
  return <p>{cookieStore.get("theme")?.value}</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Prefs store={cookies()} />
    </Suspense>
  );
}
