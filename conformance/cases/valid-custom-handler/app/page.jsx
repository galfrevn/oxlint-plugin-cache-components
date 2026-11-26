import { cacheLife, cacheTag } from "next/cache";

async function getPosts() {
  "use cache: custom";
  cacheLife("hours");
  cacheTag("posts");
  return ["first", "second"];
}

export default async function Page() {
  const posts = await getPosts();
  return (
    <ul>
      {posts.map((post) => (
        <li key={post}>{post}</li>
      ))}
    </ul>
  );
}
