async function getSummary(date, tags, filters) {
  "use cache";
  return `${date.getUTCFullYear()} ${tags.size} ${filters.get("sort")}`;
}

export default async function Page() {
  const summary = await getSummary(new Date(0), new Set(["a"]), new Map([["sort", "new"]]));
  return <p>{summary}</p>;
}
