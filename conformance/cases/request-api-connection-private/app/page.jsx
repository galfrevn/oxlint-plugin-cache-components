import { connection } from "next/server";
import { Suspense } from "react";

async function Stats() {
  "use cache: private";
  await connection();
  return <p>stats</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Stats />
    </Suspense>
  );
}
