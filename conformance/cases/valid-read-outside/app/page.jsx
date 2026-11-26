import { cookies } from "next/headers";
import { Suspense } from "react";

async function Header({ theme }) {
  "use cache";
  return <header>{theme}</header>;
}

async function ThemedHeader() {
  const theme = (await cookies()).get("theme")?.value ?? "light";
  return <Header theme={theme} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ThemedHeader />
    </Suspense>
  );
}
