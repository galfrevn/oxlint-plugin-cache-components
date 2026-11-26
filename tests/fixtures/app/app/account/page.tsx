import { cookies } from "next/headers";

async function Recommendations() {
  "use cache: private";
  const user = (await cookies()).get("uid");
  return <p>{user?.value}</p>;
}

export default async function Page() {
  "use cache";
  return <Recommendations />;
}
