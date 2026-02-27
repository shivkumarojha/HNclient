import type { SearchPage } from "../core/types.js";

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1/search_by_date";

export class AlgoliaSearchService {
  public async search(query: string, page = 0, maxAgeSeconds?: number): Promise<SearchPage> {
    const url = new URL(ALGOLIA_BASE);
    url.searchParams.set("query", query);
    url.searchParams.set("tags", "story");
    url.searchParams.set("page", String(page));
    if (maxAgeSeconds) {
      const minTimestamp = Math.floor(Date.now() / 1000) - maxAgeSeconds;
      url.searchParams.set("numericFilters", `created_at_i>${minTimestamp}`);
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Search request failed: ${res.status}`);
    }

    const payload = (await res.json()) as SearchPage;
    return {
      hits: payload.hits,
      page: payload.page,
      nbPages: payload.nbPages
    };
  }
}
