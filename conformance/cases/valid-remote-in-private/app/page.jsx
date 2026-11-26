import { Suspense } from "react";

async function Catalog() {
  "use cache: remote";
  return <p>catalog</p>;
}

async function Prefs() {
  "use cache: private";
  return <Catalog />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Prefs />
    </Suspense>
  );
}
