import { cookies } from "next/headers";
import { Suspense } from "react";

async function Cart() {
  "use cache: private";
  const cart = (await cookies()).get("cart");
  return <p>{cart?.value ?? "empty"}</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Cart />
    </Suspense>
  );
}
