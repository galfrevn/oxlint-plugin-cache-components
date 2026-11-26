import { requireRevalidatePathType } from "../../src/rules/require-revalidate-path-type.ts";
import { createTester } from "../helpers/tester.ts";

const IMPORT = `import { revalidatePath } from "next/cache";\n`;

createTester().run("cache-components/require-revalidate-path-type", requireRevalidatePathType, {
  valid: [
    { name: "concrete path", code: `${IMPORT}revalidatePath("/blog/hello");` },
    { name: "root path", code: `${IMPORT}revalidatePath("/");` },
    { name: "template with an expression", code: `${IMPORT}revalidatePath(\`/blog/\${slug}\`);` },
    {
      name: "dynamic path with a page type",
      code: `${IMPORT}revalidatePath("/blog/[slug]", "page");`,
    },
    {
      name: "dynamic path with a layout type",
      code: `${IMPORT}revalidatePath("/blog/[slug]", "layout");`,
    },
    {
      name: "segment with a prefix is not dynamic in strict mode",
      code: `${IMPORT}revalidatePath("/blog/post-[id]");`,
    },
    { name: "a variable path", code: `${IMPORT}revalidatePath(path);` },
    {
      name: "a revalidatePath function from another module",
      code: `import { revalidatePath } from "./cache";\nrevalidatePath("/blog/[slug]");`,
    },
  ],
  invalid: [
    {
      name: "dynamic segment",
      code: `${IMPORT}revalidatePath("/blog/[slug]");`,
      errors: [
        {
          message:
            '`revalidatePath("/blog/[slug]")` has no effect: "/blog/[slug]" is a dynamic route, so it needs a `type` ("page" or "layout"). See https://nextjs.org/docs/app/api-reference/functions/revalidatePath',
          suggestions: [
            {
              messageId: "addPageType",
              output: `${IMPORT}revalidatePath("/blog/[slug]", "page");`,
            },
            {
              messageId: "addLayoutType",
              output: `${IMPORT}revalidatePath("/blog/[slug]", "layout");`,
            },
          ],
        },
      ],
    },
    {
      name: "catch-all segment in a route group",
      code: `${IMPORT}revalidatePath('/(main)/shop/[...path]');`,
      errors: [
        {
          messageId: "missingType",
          data: { path: "/(main)/shop/[...path]" },
          suggestions: [
            {
              desc: 'Add "page" as the type',
              output: `${IMPORT}revalidatePath('/(main)/shop/[...path]', 'page');`,
            },
            {
              desc: 'Add "layout" as the type',
              output: `${IMPORT}revalidatePath('/(main)/shop/[...path]', 'layout');`,
            },
          ],
        },
      ],
    },
    {
      name: "optional catch-all segment",
      code: `${IMPORT}revalidatePath("/docs/[[...slug]]");`,
      errors: [{ messageId: "missingType", data: { path: "/docs/[[...slug]]" } }],
    },
    {
      name: "dynamic segment in the static part of a template",
      code: `${IMPORT}revalidatePath(\`/\${locale}/blog/[slug]\`);`,
      errors: [{ messageId: "missingType", data: { path: "/${locale}/blog/[slug]" } }],
    },
    {
      name: "renamed import",
      code: `import { revalidatePath as purge } from "next/cache";\npurge("/products/[id]/reviews");`,
      errors: [{ messageId: "missingType", data: { path: "/products/[id]/reviews" } }],
    },
  ],
});
