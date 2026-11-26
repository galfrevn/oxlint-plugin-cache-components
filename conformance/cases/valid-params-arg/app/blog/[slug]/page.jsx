import { Suspense } from "react";

async function Post({ params }) {
  "use cache";
  const { slug } = await params;
  return <p>{slug}</p>;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Post params={params} />
    </Suspense>
  );
}
