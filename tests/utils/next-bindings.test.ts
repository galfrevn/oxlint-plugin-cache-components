import type { Context } from "@oxlint/plugins";
import { describe, expect, it } from "vitest";

import { walk } from "../../src/utils/ast.ts";
import { createNextBindings, parseRequestApis } from "../../src/utils/next-bindings.ts";
import { createProbe, probeCase } from "../helpers/probe.ts";
import { createTester } from "../helpers/tester.ts";

describe("parseRequestApis", () => {
  it("splits module and export on the last colon", () => {
    expect(
      parseRequestApis(["auth", "next-auth:auth", "@clerk/nextjs/server:currentUser"]),
    ).toEqual([
      { module: null, name: "auth" },
      { module: "next-auth", name: "auth" },
      { module: "@clerk/nextjs/server", name: "currentUser" },
    ]);
  });
});

function describeCalls(requestApis: readonly string[]): (context: Context) => string[] {
  return (context) => {
    const bindings = createNextBindings(context.sourceCode, parseRequestApis(requestApis));
    const results: string[] = [];
    walk(context.sourceCode.ast, context.sourceCode.visitorKeys, (node) => {
      if (node.type === "CallExpression") {
        const callee = context.sourceCode.getText(node.callee);
        const resolved =
          bindings.resolve(node.callee) ?? bindings.resolveRequestApi(node.callee)?.name ?? "none";
        results.push(`${callee}=${resolved}`);
      }
    });
    return results;
  };
}

const tester = createTester();

tester.run("next-bindings", createProbe(describeCalls([])), {
  valid: [],
  invalid: [
    probeCase(
      `import { cookies, headers, draftMode } from "next/headers";\nimport { connection, after } from "next/server";\ncookies(); headers(); draftMode(); connection(); after(() => {});`,
      [
        "cookies=cookies",
        "headers=headers",
        "draftMode=draftMode",
        "connection=connection",
        "after=after",
      ],
      { name: "named imports" },
    ),
    probeCase(
      `import { cacheLife, cacheTag, revalidateTag, revalidatePath, updateTag, refresh, unstable_cache } from "next/cache";\ncacheLife("hours"); cacheTag("a"); revalidateTag("a", "max"); revalidatePath("/"); updateTag("a"); refresh(); unstable_cache(async () => 1);`,
      [
        "cacheLife=cacheLife",
        "cacheTag=cacheTag",
        "revalidateTag=revalidateTag",
        "revalidatePath=revalidatePath",
        "updateTag=updateTag",
        "refresh=refresh",
        "unstable_cache=unstable_cache",
      ],
      { name: "next/cache exports" },
    ),
    probeCase(
      `import { unstable_cacheLife as life, unstable_cacheTag } from "next/cache";\nlife("hours"); unstable_cacheTag("a");`,
      ["life=cacheLife", "unstable_cacheTag=cacheTag"],
      { name: "unstable aliases from older versions" },
    ),
    probeCase(`import { cookies as c } from "next/headers";\nc();`, ["c=cookies"], {
      name: "renamed import",
    }),
    probeCase(
      `import * as h from "next/headers";\nimport cache from "next/cache";\nh.cookies(); h["headers"](); cache.revalidateTag("a", "max");`,
      ["h.cookies=cookies", 'h["headers"]=headers', "cache.revalidateTag=revalidateTag"],
      { name: "namespace and default imports" },
    ),
    probeCase(
      `import React, { cache } from "react";\nconst a = cache(async () => 1);\nconst b = React.cache(async () => 2);`,
      ["cache=reactCache", "React.cache=reactCache"],
      { name: "React.cache" },
    ),
    probeCase(
      `import { cookies } from "next/headers";\nfunction read(cookies: () => void) { cookies(); }\nfunction other() { const headers = () => {}; headers(); }`,
      ["cookies=none", "headers=none"],
      { name: "shadowed identifiers do not resolve" },
    ),
    probeCase(`function cookies() {}\ncookies();`, ["cookies=none"], {
      name: "local function with the same name",
    }),
    probeCase(
      `import type { cookies } from "next/headers";\nimport { type headers } from "next/headers";\ncookies(); headers();`,
      ["cookies=none", "headers=none"],
      { name: "type-only imports" },
    ),
    probeCase(`import { cookies } from "some-other-package";\ncookies();`, ["cookies=none"], {
      name: "same name from another module",
    }),
    probeCase(
      `import { cookies } from "next/headers";\nconst readCookies = cookies;\nconst again = readCookies as typeof cookies;\nreadCookies(); again();`,
      ["readCookies=cookies", "again=cookies"],
      { name: "const aliases" },
    ),
    probeCase(
      `import * as h from "next/headers";\nconst readHeaders = h.headers;\nreadHeaders();`,
      ["readHeaders=headers"],
      { name: "const alias of a namespace member" },
    ),
    probeCase(
      `import { cookies } from "next/headers";\nlet read = cookies;\nvar other = cookies;\nread(); other();`,
      ["read=none", "other=none"],
      { name: "let and var aliases do not resolve" },
    ),
    probeCase(
      `import { cookies } from "next/headers";\nconst a = cookies;\nconst b = a;\nconst c = b;\nconst d = c;\nconst e = d;\nconst f = e;\nd(); f();`,
      ["d=cookies", "f=none"],
      { name: "alias chains stop after four steps" },
    ),
  ],
});

tester.run("next-bindings requestApis", createProbe(describeCalls(["auth"])), {
  valid: [],
  invalid: [
    probeCase(
      `import { auth } from "@/auth";\nimport { auth as getSession } from "next-auth";\nauth(); getSession();`,
      ["auth=auth", "getSession=auth"],
      { name: "entry without module matches any import" },
    ),
    probeCase(`function auth() {}\nauth();`, ["auth=none"], {
      name: "local declarations are not request APIs",
    }),
    probeCase(
      `import { auth } from "@/auth";\nconst getSession = auth;\ngetSession();`,
      ["getSession=auth"],
      {
        name: "const aliases of request APIs",
      },
    ),
  ],
});

tester.run(
  "next-bindings requestApis with module",
  createProbe(describeCalls(["next-auth:auth"])),
  {
    valid: [],
    invalid: [
      probeCase(
        `import { auth } from "next-auth";\nimport { auth as other } from "@/auth";\nauth(); other();`,
        ["auth=auth", "other=none"],
        { name: "entry with module matches only that module" },
      ),
    ],
  },
);
