import type { FeedType, HNItem } from "../core/types.js";

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

export class FirebaseHNService {
  public async getFeedIds(feed: FeedType): Promise<number[]> {
    const feedPath = `${BASE_URL}/${feed}stories.json`;
    const res = await fetch(feedPath);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${feed} feed: ${res.status}`);
    }
    return (await res.json()) as number[];
  }

  public async getItem(id: number): Promise<HNItem | null> {
    const res = await fetch(`${BASE_URL}/item/${id}.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch item ${id}: ${res.status}`);
    }
    return (await res.json()) as HNItem | null;
  }

  public async getItems(ids: number[]): Promise<HNItem[]> {
    const items = await Promise.all(ids.map((id) => this.getItem(id)));
    return items.filter((item): item is HNItem => Boolean(item));
  }
}
