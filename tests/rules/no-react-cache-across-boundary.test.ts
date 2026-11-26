import { noReactCacheAcrossBoundary } from "../../src/rules/no-react-cache-across-boundary.ts";
import { createTester } from "../helpers/tester.ts";

createTester().run("cache-components/no-react-cache-across-boundary", noReactCacheAcrossBoundary, {
  valid: [
    {
      name: "only outside a cache scope",
      code: `
import { cache } from "react";
const getUser = cache(async (id: string) => db.user.find(id));
export default async function Page({ id }: { id: string }) {
  void getUser(id);
  return <Profile user={await getUser(id)} />;
}`,
    },
    {
      name: "only inside a cache scope",
      code: `
import { cache } from "react";
const getUser = cache(async (id: string) => db.user.find(id));
async function Profile({ id }: { id: string }) {
  "use cache";
  return <h1>{(await getUser(id)).name}</h1>;
}`,
    },
    {
      name: "a component rendered only inside a cached function",
      code: `
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
}`,
    },
    {
      name: "a helper called only from cached functions through another helper",
      code: `
import { cache } from "react";
const getConfig = cache(async () => loadConfig());
async function readTheme() {
  return (await getConfig()).theme;
}
async function themeClass() {
  return \`theme-\${await readTheme()}\`;
}
export async function Shell() {
  "use cache";
  await getConfig();
  return <body className={await themeClass()} />;
}`,
    },
    {
      name: "a cache function from another library",
      code: `
import { cache } from "./memo";
const getUser = cache(async (id: string) => db.user.find(id));
export default async function Page({ id }: { id: string }) {
  void getUser(id);
  return <Profile id={id} />;
}
async function Profile({ id }: { id: string }) {
  "use cache";
  return <h1>{(await getUser(id)).name}</h1>;
}`,
    },
  ],
  invalid: [
    {
      name: "a component rendered both inside and outside a cached function",
      code: `
import { cache } from "react";
const getSeed = cache(() => Math.random());
function Badge() {
  return <span>{getSeed()}</span>;
}
async function Card() {
  "use cache";
  return <div>{getSeed()}</div>;
}
export default async function Page() {
  return (
    <main>
      <Card />
      <Badge />
    </main>
  );
}`,
      errors: [{ messageId: "isolated", line: 9 }],
    },
    {
      name: "preload outside and consume inside",
      code: `
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
}`,
      errors: [
        {
          message:
            '`getUser` is wrapped in `React.cache`, but `React.cache` runs in an isolated scope inside "use cache", so the call on line 6 isn\'t shared here. To share request data across cached functions, use "use cache: private". See https://nextjs.org/docs/app/guides/migrating-to-cache-components',
          line: 12,
        },
      ],
    },
    {
      name: "React.cache through a default import",
      code: `
import React from "react";
export const getConfig = React.cache(async () => fetchConfig());
async function Header() { "use cache: remote"; return <h1>{(await getConfig()).title}</h1>; }
export async function Layout() { await getConfig(); return <Header />; }`,
      errors: [
        {
          messageId: "isolated",
          data: { name: "getConfig", scope: '"use cache: remote"', line: 5 },
        },
      ],
    },
  ],
});
