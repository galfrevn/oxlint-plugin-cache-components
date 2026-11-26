import { Suspense } from "react";

async function Recommendations() {
  "use cache: private";
  return <p>private</p>;
}

async function Shell() {
  "use cache";
  return <Recommendations />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  );
}
