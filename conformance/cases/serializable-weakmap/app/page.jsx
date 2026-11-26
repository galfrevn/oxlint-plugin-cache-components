const owner = {};

async function isTracked(registry) {
  "use cache";
  return String(registry.has(owner));
}

export default async function Page() {
  return <p>{await isTracked(new WeakMap())}</p>;
}
