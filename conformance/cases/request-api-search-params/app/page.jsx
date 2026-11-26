export default async function Page({ searchParams }) {
  "use cache";
  const { q } = await searchParams;
  return <p>{q}</p>;
}
