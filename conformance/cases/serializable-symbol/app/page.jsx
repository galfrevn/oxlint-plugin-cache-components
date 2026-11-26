async function getLabel(key) {
  "use cache";
  return String(key.description);
}

export default async function Page() {
  return <p>{await getLabel(Symbol("theme"))}</p>;
}
