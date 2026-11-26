import { requireRevalidateTagProfile } from "../../src/rules/require-revalidate-tag-profile.ts";
import { createTester } from "../helpers/tester.ts";

const MESSAGE =
  '`revalidateTag()` without a second argument is deprecated and behaves like `{ expire: 0 }`. Pass a profile ("max" for stale-while-revalidate) or use `updateTag()` in Server Actions. See https://nextjs.org/docs/messages/revalidate-tag-single-arg';

createTester().run("cache-components/require-revalidate-tag-profile", requireRevalidateTagProfile, {
  valid: [
    {
      name: "with a profile",
      code: `import { revalidateTag } from "next/cache";\nrevalidateTag("posts", "max");`,
    },
    {
      name: "with an inline profile",
      code: `import { revalidateTag } from "next/cache";\nrevalidateTag("posts", { expire: 0 });`,
    },
    {
      name: "with a spread argument",
      code: `import { revalidateTag } from "next/cache";\nrevalidateTag(...args);`,
    },
    {
      name: "a revalidateTag function from another module",
      code: `import { revalidateTag } from "./cache";\nrevalidateTag("posts");`,
    },
  ],
  invalid: [
    {
      name: "one argument outside a server action",
      code: `import { revalidateTag } from "next/cache";\nexport async function purge() { revalidateTag("posts"); }`,
      errors: [
        {
          message: MESSAGE,
          suggestions: [
            {
              messageId: "keepBehavior",
              output: `import { revalidateTag } from "next/cache";\nexport async function purge() { revalidateTag("posts", { expire: 0 }); }`,
            },
            {
              messageId: "useMax",
              output: `import { revalidateTag } from "next/cache";\nexport async function purge() { revalidateTag("posts", "max"); }`,
            },
          ],
        },
      ],
    },
    {
      name: "one argument inside a server action",
      filename: "app/actions.ts",
      code: `"use server";\nimport { revalidateTag } from "next/cache";\nexport async function save() { revalidateTag('posts'); }`,
      errors: [
        {
          messageId: "singleArg",
          suggestions: [
            {
              desc: "Pass { expire: 0 } (same behavior)",
              output: `"use server";\nimport { revalidateTag } from "next/cache";\nexport async function save() { revalidateTag('posts', { expire: 0 }); }`,
            },
            {
              desc: "Use updateTag() (Server Action)",
              output: `"use server";\nimport { revalidateTag, updateTag } from "next/cache";\nexport async function save() { updateTag('posts'); }`,
            },
            {
              desc: 'Pass "max" (stale-while-revalidate)',
              output: `"use server";\nimport { revalidateTag } from "next/cache";\nexport async function save() { revalidateTag('posts', 'max'); }`,
            },
          ],
        },
      ],
    },
    {
      name: "updateTag already imported under an alias",
      filename: "app/actions.ts",
      code: `"use server";\nimport { revalidateTag as purge, updateTag as update } from "next/cache";\nexport async function save() { purge("posts"); }`,
      errors: [
        {
          messageId: "singleArg",
          suggestions: [
            {
              messageId: "keepBehavior",
              output: `"use server";\nimport { revalidateTag as purge, updateTag as update } from "next/cache";\nexport async function save() { purge("posts", { expire: 0 }); }`,
            },
            {
              messageId: "useUpdateTag",
              output: `"use server";\nimport { revalidateTag as purge, updateTag as update } from "next/cache";\nexport async function save() { update("posts"); }`,
            },
            {
              messageId: "useMax",
              output: `"use server";\nimport { revalidateTag as purge, updateTag as update } from "next/cache";\nexport async function save() { purge("posts", "max"); }`,
            },
          ],
        },
      ],
    },
    {
      name: "namespace import inside an inline server action",
      filename: "app/page.tsx",
      code: `import * as cache from "next/cache";\nexport default function Page() {\n  async function save() { "use server"; cache.revalidateTag("posts"); }\n  return <form action={save} />;\n}`,
      errors: [
        {
          messageId: "singleArg",
          suggestions: [
            {
              messageId: "keepBehavior",
              output: `import * as cache from "next/cache";\nexport default function Page() {\n  async function save() { "use server"; cache.revalidateTag("posts", { expire: 0 }); }\n  return <form action={save} />;\n}`,
            },
            {
              messageId: "useUpdateTag",
              output: `import * as cache from "next/cache";\nexport default function Page() {\n  async function save() { "use server"; cache.updateTag("posts"); }\n  return <form action={save} />;\n}`,
            },
            {
              messageId: "useMax",
              output: `import * as cache from "next/cache";\nexport default function Page() {\n  async function save() { "use server"; cache.revalidateTag("posts", "max"); }\n  return <form action={save} />;\n}`,
            },
          ],
        },
      ],
    },
    {
      name: "a route handler gets no updateTag suggestion",
      filename: "app/api/route.ts",
      code: `import { revalidateTag } from "next/cache";\nexport async function POST() { revalidateTag(\`tag-\${1}\`); }`,
      errors: [
        {
          messageId: "singleArg",
          suggestions: [
            {
              messageId: "keepBehavior",
              output: `import { revalidateTag } from "next/cache";\nexport async function POST() { revalidateTag(\`tag-\${1}\`, { expire: 0 }); }`,
            },
            {
              messageId: "useMax",
              output: `import { revalidateTag } from "next/cache";\nexport async function POST() { revalidateTag(\`tag-\${1}\`, "max"); }`,
            },
          ],
        },
      ],
    },
  ],
});
