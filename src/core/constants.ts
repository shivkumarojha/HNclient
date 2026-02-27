import type { AppConfig, FeedType } from "./types.js";

export const FEEDS: FeedType[] = ["top", "new", "best", "ask", "show", "job"];

export const DEFAULT_CONFIG: AppConfig = {
  defaultFeed: "top",
  chunkSize: 30,
  articleMode: "terminal",
  cacheTtlSeconds: {
    feed: 60,
    item: 300,
    search: 120,
    article: 600
  }
};
