# `cache-components/no-react-cache-across-boundary`

Disallow sharing a `React.cache` function between cached and uncached code, where its result is not shared.

**Preset:** `strict` (warn) · **Type:** suggestion · **Fix:** no · **Suggestions:** no

## Rule details

`React.cache` runs in an isolated scope inside a `"use cache"` boundary. A value stored by a `React.cache` call outside the boundary is not visible inside it, so a "preload" call outside and a "consume" call inside run the function twice.

The rule finds functions created with `cache()` from `react` at the top level of the file. When one is called both outside any cache scope and inside a cached function in the same file, it reports each call inside a cached function.

A call counts as inside when it is in a cached function, or in a function that is not exported and that the file calls or renders only from cached functions. Every other call counts as outside.

This is not an error in Next.js. It is duplicated work, which is why the rule is a warning in `strict`. In the conformance app, a `React.cache` function called once outside and once inside `"use cache"` ran three times during `next build`. With both calls outside, it ran twice.

## Examples

Invalid:

```tsx
import { cache } from "react";

const getUser = cache(async (id: string) => db.user.find(id));

export default async function Page({ id }: { id: string }) {
  void getUser(id);
  return <Profile id={id} />;
}

async function Profile({ id }: { id: string }) {
  "use cache";
  const user = await getUser(id);
  return <h1>{user.name}</h1>;
}
```

Valid: call the function only on one side of the boundary. To share request data across cached functions, use `"use cache: private"`.

Valid: `Badge` is rendered only from the cached `Card`, so both calls run inside the same cache scope and share the result.

```tsx
import { cache } from "react";
const getSeed = cache(() => Math.random());
function Badge() {
  return <span>{getSeed()}</span>;
}
async function Card() {
  "use cache";
  return (
    <div>
      {getSeed()}
      <Badge />
    </div>
  );
}
export default async function Page() {
  return <Card />;
}
```

## Limitations

- Calls in other files are not seen.
- A `React.cache` function passed around as a value is not followed.

## Related

- Next.js: [Migrating to Cache Components, `React.cache`](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
