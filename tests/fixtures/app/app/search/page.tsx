export default function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Results query={searchParams} />;
}

async function Results({ query }: { query: Promise<{ q?: string }> }) {
  "use cache";
  const { q } = await query;
  return <p>{q}</p>;
}
