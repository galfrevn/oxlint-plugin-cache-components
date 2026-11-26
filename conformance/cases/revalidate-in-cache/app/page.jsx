import { revalidateTag } from "next/cache";

async function Data() {
  "use cache";
  revalidateTag("posts", "max");
  return <p>data</p>;
}

export default function Page() {
  return <Data />;
}
