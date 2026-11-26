import { draftMode } from "next/headers";
import { Suspense } from "react";

async function Preview() {
  "use cache: private";
  (await draftMode()).enable();
  return <p>preview</p>;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}
