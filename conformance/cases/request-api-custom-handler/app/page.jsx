import { cookies } from "next/headers";

async function Theme() {
  "use cache: custom";
  const theme = (await cookies()).get("theme");
  return <p>{theme?.value ?? "light"}</p>;
}

export default function Page() {
  return <Theme />;
}
