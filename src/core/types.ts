export type FeedType = "top" | "new" | "best" | "ask" | "show" | "job";

export interface HNItem {
  id: number;
  type: "story" | "comment" | "job" | "poll" | "pollopt";
  by?: string;
  title?: string;
  text?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  parent?: number;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
}

export interface StoryRow {
  id: number;
  title: string;
  by: string;
  score: number;
  comments: number;
  time: number;
  url?: string;
  kind: HNItem["type"];
}

export interface CommentNode {
  id: number;
  by: string;
  text: string;
  time: number;
  depth: number;
  parentId?: number;
  children: CommentNode[];
}

export interface SearchHit {
  objectID: string;
  title?: string;
  story_title?: string;
  story_text?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  url?: string;
  story_url?: string;
  created_at_i?: number;
}

export interface SearchPage {
  hits: SearchHit[];
  page: number;
  nbPages: number;
}

export interface AppConfig {
  defaultFeed: FeedType;
  chunkSize: number;
  articleMode: "terminal";
  cacheTtlSeconds: {
    feed: number;
    item: number;
    search: number;
    article: number;
  };
}

export interface ArticleDocument {
  title: string;
  url: string;
  body: string;
  status: "ok" | "fallback";
}
