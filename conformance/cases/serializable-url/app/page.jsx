async function getPath(url) {
  "use cache";
  console.log(`pathname: ${JSON.stringify(url.pathname)}`);
  return url.pathname;
}

export default async function Page() {
  return <p>{await getPath(new URL("https://example.com/posts"))}</p>;
}
