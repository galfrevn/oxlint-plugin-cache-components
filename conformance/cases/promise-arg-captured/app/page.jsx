import { connection } from "next/server";
import { Suspense } from "react";

async function fetchUncachedData() {
  await connection();
  return Math.random();
}

async function Inner() {
  const uncachedDataPromise = fetchUncachedData();
  const Foo = async () => {
    "use cache";
    return <p>{await uncachedDataPromise}</p>;
  };
  return <Foo />;
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Inner />
    </Suspense>
  );
}
