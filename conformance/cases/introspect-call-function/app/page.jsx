async function Shell({ format }) {
  "use cache";
  return <p>{format("shell")}</p>;
}

function upper(value) {
  return value.toUpperCase();
}

export default function Page() {
  return <Shell format={upper} />;
}
