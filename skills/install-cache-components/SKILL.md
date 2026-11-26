---
name: install-cache-components
description: Install and configure oxlint-plugin-cache-components, the lint rules for Next.js Cache Components ("use cache", cacheLife, cacheTag, revalidateTag, updateTag, refresh). Use when a Next.js project enables cacheComponents or uses "use cache", and the user wants these mistakes caught in the editor, in CI, or in the agent loop.
---

# Install oxlint-plugin-cache-components

The plugin reports Cache Components mistakes that Next.js otherwise reports only at runtime, during prerender, or as a console warning. Install it into the existing lint setup without replacing the user's configuration.

## 1. Inspect the repository

Read the repository's agent instructions and `git status`. Identify:

- The package manager, from the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`).
- The Next.js app directories: `app`, `src/app`, or app directories inside workspace packages such as `apps/web/app`.
- The lint setup: `oxlint.config.ts`, `.oxlintrc.json`, a Vite+ config with a `lint` section, or an ESLint flat config (`eslint.config.*`).
- The installed `oxlint` version, if any, from the lockfile or the package manager.
- Auth libraries that read cookies or headers: `next-auth`, `@clerk/nextjs`, `better-auth`, `@workos-inc/authkit-nextjs`, `@supabase/ssr`.

Complete when you know the package manager, the lint runner and its config file, and the app directories.

## 2. Install the packages

Install as development dependencies, in the package that owns the lint config:

- With oxlint: `oxlint-plugin-cache-components`. If `oxlint` is missing, install it too. If the installed `oxlint` is older than 1.95.0, ask the user before upgrading it.
- With ESLint only: `oxlint-plugin-cache-components`. Do not add oxlint unless the user asks.

Use the repository's package manager, for example `pnpm add -D oxlint oxlint-plugin-cache-components`. Do not change unrelated dependency ranges.

If the package manager rejects a version because of a minimum release age policy, such as `minimumReleaseAge` in pnpm, do not add an exclusion or lower the policy. Tell the user, and install the newest version that the policy allows only if they agree.

Complete when the package appears in `devDependencies` and the lockfile is updated.

## 3. Enable the recommended preset

Merge the preset into the existing configuration. Keep every existing rule, plugin, ignore pattern, and override.

`oxlint.config.ts`:

```ts
import { defineConfig } from "oxlint";
import cacheComponents from "oxlint-plugin-cache-components/configs";

export default defineConfig({
  extends: [cacheComponents.recommended],
});
```

When the file already exists, add `cacheComponents.recommended` to its `extends` array instead of replacing the file. When the repository has no oxlint configuration, create `oxlint.config.ts` only if the nearest `package.json` has `"type": "module"`. Otherwise create `.oxlintrc.json`, because Node.js prints a `MODULE_TYPELESS_PACKAGE_JSON` warning on every run when it loads `oxlint.config.ts` from a package without `"type": "module"`.

`.oxlintrc.json`:

```json
{
  "jsPlugins": ["oxlint-plugin-cache-components"],
  "rules": {
    "cache-components/no-request-api-in-cache": "error",
    "cache-components/no-cache-api-outside-cache": "error",
    "cache-components/require-cachelife-when-nested": "error",
    "cache-components/no-invalid-cache-nesting": "error",
    "cache-components/valid-invalidation-context": "error",
    "cache-components/no-promise-args-to-cache": "error",
    "cache-components/require-revalidate-tag-profile": "warn",
    "cache-components/require-revalidate-path-type": "warn",
    "cache-components/require-auth-before-revalidate": "warn"
  }
}
```

Append the plugin to an existing `jsPlugins` array and merge the rules into the existing `rules` object.

ESLint flat config:

```js
import cacheComponents from "oxlint-plugin-cache-components";

export default [
  cacheComponents.configs["flat/recommended"],
];
```

Then add shared settings when they apply:

- If the repository uses an auth library, add its function to `requestApis`, for example `"next-auth:auth"` or `"@clerk/nextjs/server:currentUser"`.
- If the app directory is not `app` or `src/app` relative to where lint runs, set `appDir`, for example `["apps/web/app"]`.

```json
{
  "settings": {
    "cache-components": {
      "requestApis": ["next-auth:auth"],
      "appDir": ["apps/web/app"]
    }
  }
}
```

Complete when the lint config loads the plugin and every `cache-components/*` rule from the preset is enabled.

## 4. Offer the post-edit hook

Ask the user whether to add a hook that lints each file the agent edits. If they agree, follow [the hook recipes](references/hooks.md) for the harness that is running. Offer both variants: pass the findings to the agent as context, or block the step until they are fixed.

Complete when the user has accepted or declined the hook, and an accepted hook is installed and executable.

## 5. Run the linter once

Run the linter on the app directories, for example `npx oxlint --format agent app`. Summarize the `cache-components/*` findings by rule, with file and line.

Do not fix the findings automatically. Several suggestions change caching behavior, and some reports need a product decision, such as which `cacheLife` profile to use. Ask the user how to proceed.

Complete when the linter ran without configuration errors and the user has the summary.
