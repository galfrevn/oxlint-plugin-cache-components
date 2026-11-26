import { cookies } from "next/headers";

export default function Page() {
  return <Prefs store={cookies()} />;
}

async function Prefs({ store }: { store: ReturnType<typeof cookies> }) {
  "use cache";
  const theme = (await store).get("theme");
  return <p>{theme?.value}</p>;
}
