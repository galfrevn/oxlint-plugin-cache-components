import { fileURLToPath } from "node:url";

const config = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandlers: {
    custom: fileURLToPath(new URL("./cache-handler.mjs", import.meta.url)),
  },
  turbopack: {
    root: import.meta.dirname,
  },
};

export default config;
