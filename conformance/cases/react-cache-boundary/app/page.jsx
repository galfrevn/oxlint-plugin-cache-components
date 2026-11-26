import { cache } from "react";

const getSettings = cache(async () => {
  console.log("getSettings ran");
  return { theme: "dark" };
});

async function Theme() {
  "use cache";
  const settings = await getSettings();
  return <p>{settings.theme}</p>;
}

export default async function Page() {
  await getSettings();
  return <Theme />;
}
