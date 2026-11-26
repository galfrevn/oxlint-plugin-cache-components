import { cookies } from "next/headers";

export default async function Page() {
  "use cache";
  const theme = (await cookies()).get("theme");
  return <main data-theme={theme?.value} />;
}
