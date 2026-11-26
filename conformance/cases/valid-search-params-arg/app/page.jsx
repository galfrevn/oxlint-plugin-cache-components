import { Suspense } from "react";

async function Results({ query }) {
  "use cache";
  const { q } = await query;
  return <p>{q}</p>;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Results query={searchParams} />
    </Suspense>
  );
}
