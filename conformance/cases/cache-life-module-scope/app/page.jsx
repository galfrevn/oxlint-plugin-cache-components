import { cacheLife } from "next/cache";

cacheLife("hours");

export default function Page() {
  return <p>ok</p>;
}
