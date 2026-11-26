const entries = new Map();
const invalidations = new Map();

function latestInvalidation(tags) {
  return Math.max(0, ...tags.map((tag) => invalidations.get(tag) ?? 0));
}

function replay(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

const handler = {
  async get(cacheKey, softTags) {
    const entry = entries.get(cacheKey);
    if (!entry || latestInvalidation([...entry.tags, ...softTags]) > entry.timestamp) {
      return undefined;
    }
    return { ...entry, value: replay(entry.chunks) };
  },
  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry;
    const chunks = [];
    for await (const chunk of entry.value) {
      chunks.push(chunk);
    }
    entries.set(cacheKey, { ...entry, chunks });
  },
  async refreshTags() {},
  async getExpiration(tags) {
    return latestInvalidation(tags);
  },
  async updateTags(tags) {
    const now = Date.now();
    for (const tag of tags) {
      invalidations.set(tag, now);
    }
  },
};

export default handler;
