import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildCommentTree, flattenCommentTree } from "../core/comments.js";
import { FEEDS } from "../core/constants.js";
import type { AppConfig, CommentNode, FeedType, HNItem, StoryRow } from "../core/types.js";
import { stripHtml, trimLine, unixToRelative } from "../core/utils.js";
import { AlgoliaSearchService } from "../data/algolia.js";
import { FirebaseHNService } from "../data/firebase.js";
import { ArticleService } from "../render/article.js";
import { FileTtlCache } from "../store/ttl-cache.js";

type Pane = "feed" | "comments" | "search" | "article";
type InputMode = "local" | "global";

interface AppProps {
  config: AppConfig;
  initialFeed: FeedType;
  initialSearch?: string;
  noCache: boolean;
}

const hn = new FirebaseHNService();
const search = new AlgoliaSearchService();
const article = new ArticleService();
const cache = new FileTtlCache();

export function App({ config, initialFeed, initialSearch, noCache = false }: AppProps) {
  const { height } = useTerminalDimensions();
  const [pane, setPane] = useState<Pane>("feed");
  const [paneStack, setPaneStack] = useState<Pane[]>([]);
  const [sourcePane, setSourcePane] = useState<Pane>("feed");
  const [feed, setFeed] = useState<FeedType>(initialFeed);
  const [feedIds, setFeedIds] = useState<number[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState("Loading feed...");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [commentTree, setCommentTree] = useState<CommentNode[]>([]);
  const [flatComments, setFlatComments] = useState<CommentNode[]>([]);
  const [commentCursor, setCommentCursor] = useState(0);
  const [articleBodyLines, setArticleBodyLines] = useState<string[]>([]);
  const [articleTitle, setArticleTitle] = useState<string>("");
  const [articleUrl, setArticleUrl] = useState<string>("");
  const [articleOffset, setArticleOffset] = useState(0);
  const [activeStory, setActiveStory] = useState<StoryRow | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
  const [searchResults, setSearchResults] = useState<StoryRow[]>([]);
  const [searchCursor, setSearchCursor] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode | null>(initialSearch ? null : null);
  const [inputValue, setInputValue] = useState("");
  const [localMatches, setLocalMatches] = useState<number[]>([]);
  const [localMatchIdx, setLocalMatchIdx] = useState(0);
  const [pendingG, setPendingG] = useState(false);

  const pageSize = Math.max(8, height - 7);

  const visibleStories = useMemo(() => {
    const start = Math.max(0, cursor - Math.floor(pageSize / 2));
    const end = Math.min(stories.length, start + pageSize);
    return {
      start,
      rows: stories.slice(start, end)
    };
  }, [cursor, pageSize, stories]);

  const visibleComments = useMemo(() => {
    const start = Math.max(0, commentCursor - Math.floor(pageSize / 2));
    const end = Math.min(flatComments.length, start + pageSize);
    return {
      start,
      rows: flatComments.slice(start, end)
    };
  }, [commentCursor, flatComments, pageSize]);

  const visibleSearch = useMemo(() => {
    const start = Math.max(0, searchCursor - Math.floor(pageSize / 2));
    const end = Math.min(searchResults.length, start + pageSize);
    return {
      start,
      rows: searchResults.slice(start, end)
    };
  }, [searchCursor, searchResults, pageSize]);

  const activeStoryList = pane === "search" ? searchResults : stories;

  const getCached = useCallback(
    async <T,>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> => {
      if (noCache) {
        return loader();
      }
      const hit = await cache.get<T>(key);
      if (hit) {
        return hit;
      }
      const loaded = await loader();
      await cache.set(key, loaded, ttl);
      return loaded;
    },
    [noCache]
  );

  const toStoryRow = useCallback((item: HNItem): StoryRow | null => {
    if (!item || !item.id) return null;
    if (!["story", "job", "poll"].includes(item.type)) return null;
    const row: StoryRow = {
      id: item.id,
      kind: item.type,
      title: stripHtml(item.title ?? "(no title)"),
      by: item.by ?? "unknown",
      score: item.score ?? 0,
      comments: item.descendants ?? 0,
      time: item.time ?? 0
    };
    if (item.url) {
      row.url = item.url;
    }
    return row;
  }, []);

  const loadMoreStories = useCallback(async () => {
    if (loading || stories.length >= feedIds.length) {
      return;
    }

    setLoading(true);
    try {
      const nextIds = feedIds.slice(stories.length, stories.length + config.chunkSize);
      const items = await Promise.all(
        nextIds.map((id) =>
          getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => {
            const item = await hn.getItem(id);
            return item;
          })
        )
      );

      const nextRows = items.map((item) => (item ? toStoryRow(item) : null)).filter((row): row is StoryRow => Boolean(row));
      setStories((prev) => [...prev, ...nextRows]);
      setStatus(`${feed.toUpperCase()} ${Math.min(stories.length + nextRows.length, feedIds.length)}/${feedIds.length}`);
    } catch (error) {
      setStatus(`Failed loading feed chunk: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [config.cacheTtlSeconds.item, config.chunkSize, feed, feedIds, getCached, loading, stories.length, toStoryRow]);

  const refreshFeed = useCallback(
    async (targetFeed: FeedType, shouldResetCursor = true) => {
      setLoading(true);
      setStatus(`Loading ${targetFeed}...`);
      try {
        const ids = await getCached(`feed:${targetFeed}`, config.cacheTtlSeconds.feed, async () => hn.getFeedIds(targetFeed));
        setFeedIds(ids);
        setStories([]);
        setFeed(targetFeed);
        if (shouldResetCursor) setCursor(0);

        const firstIds = ids.slice(0, config.chunkSize);
        const items = await Promise.all(
          firstIds.map((id) =>
            getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => {
              const item = await hn.getItem(id);
              return item;
            })
          )
        );
        const rows = items.map((item) => (item ? toStoryRow(item) : null)).filter((row): row is StoryRow => Boolean(row));
        setStories(rows);
        setStatus(`${targetFeed.toUpperCase()} ${rows.length}/${ids.length}`);
      } catch (error) {
        setStatus(`Feed error: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.feed, config.cacheTtlSeconds.item, config.chunkSize, getCached, toStoryRow]
  );

  const loadComments = useCallback(
    async (story: StoryRow, fromPane: Pane) => {
      setLoading(true);
      setStatus(`Loading comments for ${story.id}...`);
      try {
        const root = await getCached(`item:${story.id}`, config.cacheTtlSeconds.item, async () => hn.getItem(story.id));
        const kids = root?.kids ?? [];
        const queue = [...kids];
        const map: Record<number, HNItem> = {};
        const visited = new Set<number>();

        while (queue.length > 0) {
          const id = queue.shift();
          if (!id || visited.has(id)) continue;
          visited.add(id);

          const item = await getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => hn.getItem(id));
          if (!item) continue;
          map[item.id] = item;
          for (const childId of item.kids ?? []) {
            if (!visited.has(childId)) queue.push(childId);
          }
        }

        const tree = buildCommentTree(kids, map);
        const flat = flattenCommentTree(tree, new Set());
        setCommentTree(tree);
        setFlatComments(flat);
        setCollapsed(new Set());
        setCommentCursor(0);
        setActiveStory(story);
        setSourcePane(fromPane);
        setPaneStack((prev) => [...prev, pane]);
        setPane("comments");
        setStatus(`Comments: ${flat.length} visible`);
      } catch (error) {
        setStatus(`Comment load error: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.item, getCached, pane]
  );

  const openArticle = useCallback(
    async (story: StoryRow) => {
      if (!story.url) {
        setStatus("No URL for this item.");
        return;
      }

      setLoading(true);
      setStatus(`Loading article ${story.url}...`);
      try {
        const doc = await getCached(`article:${story.url}`, config.cacheTtlSeconds.article, async () => article.render(story.url!));
        setArticleTitle(doc.title || story.title);
        setArticleUrl(doc.url);
        setArticleBodyLines(doc.body.split("\n"));
        setArticleOffset(0);
        setPaneStack((prev) => [...prev, pane]);
        setPane("article");
        setStatus(`Article loaded (${doc.status}).`);
      } catch (error) {
        setStatus(`Article load error: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.article, getCached, pane]
  );

  const runGlobalSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setStatus("Search query is empty.");
        return;
      }
      setLoading(true);
      setStatus(`Searching for \"${query}\"...`);
      try {
        const page = await getCached(`search:${query}:0`, config.cacheTtlSeconds.search, async () => search.search(query, 0));
        const rows = page.hits
          .map((hit): StoryRow | null => {
            const id = Number.parseInt(hit.objectID, 10);
            if (!Number.isFinite(id)) return null;
            const row: StoryRow = {
              id,
              kind: "story",
              title: stripHtml(hit.title ?? hit.story_title ?? "(no title)"),
              by: hit.author ?? "unknown",
              score: hit.points ?? 0,
              comments: hit.num_comments ?? 0,
              time: hit.created_at_i ?? 0
            };
            const resolvedUrl = hit.url ?? hit.story_url;
            if (resolvedUrl) {
              row.url = resolvedUrl;
            }
            return row;
          })
          .filter((row): row is StoryRow => Boolean(row));
        setSearchQuery(query);
        setSearchResults(rows);
        setSearchCursor(0);
        setPane("search");
        setStatus(`Search found ${rows.length} results.`);
      } catch (error) {
        setStatus(`Search error: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.search, getCached]
  );

  useEffect(() => {
    void refreshFeed(initialFeed, true);
  }, [initialFeed, refreshFeed]);

  useEffect(() => {
    if (initialSearch) {
      void runGlobalSearch(initialSearch);
    }
  }, [initialSearch, runGlobalSearch]);

  useEffect(() => {
    if (pane === "feed" && cursor >= stories.length - 3 && stories.length < feedIds.length) {
      void loadMoreStories();
    }
  }, [cursor, feedIds.length, loadMoreStories, pane, stories.length]);

  const setCommentCollapse = useCallback(
    (commentId: number, collapse: boolean) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (collapse) next.add(commentId);
        else next.delete(commentId);
        setFlatComments(flattenCommentTree(commentTree, next));
        return next;
      });
    },
    [commentTree]
  );

  const back = useCallback(() => {
    if (inputMode) {
      setInputMode(null);
      setInputValue("");
      return;
    }

    const prev = paneStack[paneStack.length - 1];
    if (prev) {
      setPaneStack((stack) => stack.slice(0, -1));
      setPane(prev);
      setStatus(`Back to ${prev}.`);
      return;
    }

    if (pane === "search" && sourcePane === "feed") {
      setPane("feed");
      setStatus("Back to feed.");
      return;
    }

    if (pane === "feed") {
      process.exit(0);
    }
  }, [inputMode, pane, paneStack, sourcePane]);

  const charFromKey = (name: string, shift: boolean): string | null => {
    if (name === "space") return " ";
    if (name.length === 1) {
      return shift ? name.toUpperCase() : name;
    }
    return null;
  };

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      process.exit(0);
    }

    if (inputMode) {
      if (key.name === "escape") {
        setInputMode(null);
        setInputValue("");
        setStatus("Canceled input.");
        return;
      }
      if (key.name === "return") {
        const value = inputValue.trim();
        if (inputMode === "local") {
          const q = value.toLowerCase();
          const matches = stories
            .map((row, idx) => ({ idx, hit: row.title.toLowerCase().includes(q) }))
            .filter((item) => item.hit)
            .map((item) => item.idx);
          setLocalMatches(matches);
          setLocalMatchIdx(0);
          if (matches.length > 0) {
            setCursor(matches[0]!);
            setStatus(`Local matches: ${matches.length}.`);
          } else {
            setStatus("No local matches.");
          }
        } else {
          void runGlobalSearch(value);
        }
        setInputMode(null);
        setInputValue("");
        return;
      }
      if (key.name === "backspace") {
        setInputValue((prev) => prev.slice(0, -1));
        return;
      }
      const char = charFromKey(key.name, key.shift);
      if (char) {
        setInputValue((prev) => `${prev}${char}`);
      }
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      back();
      return;
    }

    if (key.name === "r") {
      void refreshFeed(feed, false);
      return;
    }

    if (key.name === "/") {
      setInputMode("local");
      setInputValue("");
      setStatus("Local search (current feed): type and Enter.");
      return;
    }

    if (key.name === "?") {
      setInputMode("global");
      setInputValue(searchQuery);
      setStatus("Global search (Algolia): type and Enter.");
      return;
    }

    if (key.name === "n" && localMatches.length > 0) {
      const next = (localMatchIdx + 1) % localMatches.length;
      setLocalMatchIdx(next);
      setCursor(localMatches[next]!);
      return;
    }

    if (key.name === "n" && key.shift && localMatches.length > 0) {
      const next = (localMatchIdx - 1 + localMatches.length) % localMatches.length;
      setLocalMatchIdx(next);
      setCursor(localMatches[next]!);
      return;
    }

    if (key.name === "g") {
      if (pendingG) {
        if (pane === "feed") setCursor(0);
        if (pane === "comments") setCommentCursor(0);
        if (pane === "search") setSearchCursor(0);
        if (pane === "article") setArticleOffset(0);
        setPendingG(false);
      } else {
        setPendingG(true);
        setTimeout(() => setPendingG(false), 400);
      }
      return;
    }

    if (key.name === "G") {
      if (pane === "feed") setCursor(Math.max(0, stories.length - 1));
      if (pane === "comments") setCommentCursor(Math.max(0, flatComments.length - 1));
      if (pane === "search") setSearchCursor(Math.max(0, searchResults.length - 1));
      if (pane === "article") setArticleOffset(Math.max(0, articleBodyLines.length - pageSize));
      return;
    }

    if (key.name.length === 1 && /[1-6]/.test(key.name)) {
      const idx = Number.parseInt(key.name, 10) - 1;
      const selectedFeed = FEEDS[idx];
      if (selectedFeed) {
        setPane("feed");
        setPaneStack([]);
        void refreshFeed(selectedFeed, true);
      }
      return;
    }

    if (pane === "feed") {
      if (key.name === "j" || key.name === "down") {
        setCursor((prev) => Math.min(prev + 1, Math.max(0, stories.length - 1)));
      }
      if (key.name === "k" || key.name === "up") {
        setCursor((prev) => Math.max(prev - 1, 0));
      }
      if (key.name === "return") {
        const story = stories[cursor];
        if (story) void loadComments(story, "feed");
      }
      if (key.name === "o") {
        const story = stories[cursor];
        if (story) void openArticle(story);
      }
      if (key.name === "space") {
        void loadMoreStories();
      }
      return;
    }

    if (pane === "search") {
      if (key.name === "j" || key.name === "down") {
        setSearchCursor((prev) => Math.min(prev + 1, Math.max(0, searchResults.length - 1)));
      }
      if (key.name === "k" || key.name === "up") {
        setSearchCursor((prev) => Math.max(prev - 1, 0));
      }
      if (key.name === "return") {
        const story = searchResults[searchCursor];
        if (story) void loadComments(story, "search");
      }
      if (key.name === "o") {
        const story = searchResults[searchCursor];
        if (story) void openArticle(story);
      }
      return;
    }

    if (pane === "comments") {
      if (key.name === "j" || key.name === "down") {
        setCommentCursor((prev) => Math.min(prev + 1, Math.max(0, flatComments.length - 1)));
      }
      if (key.name === "k" || key.name === "up") {
        setCommentCursor((prev) => Math.max(prev - 1, 0));
      }
      if (key.name === "h") {
        const current = flatComments[commentCursor];
        if (current && current.children.length > 0) {
          setCommentCollapse(current.id, true);
        }
      }
      if (key.name === "l") {
        const current = flatComments[commentCursor];
        if (current) {
          setCommentCollapse(current.id, false);
        }
      }
      if (key.name === "o" && activeStory) {
        void openArticle(activeStory);
      }
      return;
    }

    if (pane === "article") {
      if (key.name === "j" || key.name === "down") {
        setArticleOffset((prev) => Math.min(prev + 1, Math.max(0, articleBodyLines.length - pageSize)));
      }
      if (key.name === "k" || key.name === "up") {
        setArticleOffset((prev) => Math.max(prev - 1, 0));
      }
    }
  });

  const helpLine =
    "j/k move  gg/G top/bottom  / local  ? global  n/N next/prev  Enter comments  o article  1..6 feeds  q back/quit";

  const header = `HN ${feed.toUpperCase()} | pane:${pane} | loaded:${stories.length}/${feedIds.length}`;

  const renderFeedLines = () => {
    if (stories.length === 0) return ["No stories loaded."];
    return visibleStories.rows.map((story, idx) => {
      const absolute = visibleStories.start + idx;
      const marker = absolute === cursor ? ">" : " ";
      return `${marker} ${String(absolute + 1).padStart(3, "0")} ${trimLine(story.title, 90)}  (${story.score} pts, ${story.comments} comments, ${unixToRelative(story.time)})`;
    });
  };

  const renderCommentLines = () => {
    if (flatComments.length === 0) return ["No comments."];
    return visibleComments.rows.map((comment, idx) => {
      const absolute = visibleComments.start + idx;
      const marker = absolute === commentCursor ? ">" : " ";
      const collapsedMark = comment.children.length > 0 ? (collapsed.has(comment.id) ? "[+]" : "[-]") : "   ";
      const indent = "  ".repeat(comment.depth);
      const text = trimLine(stripHtml(comment.text), 80);
      return `${marker} ${collapsedMark} ${indent}${comment.by}: ${text}`;
    });
  };

  const renderSearchLines = () => {
    if (searchResults.length === 0) return ["No search results."];
    return visibleSearch.rows.map((story, idx) => {
      const absolute = visibleSearch.start + idx;
      const marker = absolute === searchCursor ? ">" : " ";
      return `${marker} ${String(absolute + 1).padStart(3, "0")} ${trimLine(story.title, 90)} (${story.comments} comments)`;
    });
  };

  const renderArticleLines = () => {
    const viewport = articleBodyLines.slice(articleOffset, articleOffset + pageSize);
    const top = `${articleTitle}\n${articleUrl}\n${"-".repeat(40)}`;
    return [top, ...viewport.map((line) => trimLine(line, 100))];
  };

  const bodyLines =
    pane === "feed"
      ? renderFeedLines()
      : pane === "comments"
        ? renderCommentLines()
        : pane === "search"
          ? renderSearchLines()
          : renderArticleLines();

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      <text>{header}</text>
      <text>{loading ? "Loading..." : status}</text>
      <text>{helpLine}</text>
      <text>{""}</text>
      <text>{bodyLines.join("\n")}</text>
      {inputMode ? <text>{`${inputMode === "local" ? "/" : "?"}${inputValue}`}</text> : null}
    </box>
  );
}
