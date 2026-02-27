import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openExternal } from "../core/browser.js";
import { buildCommentTree, flattenCommentTree } from "../core/comments.js";
import { FEEDS } from "../core/constants.js";
import { clearTerminal } from "../core/terminal.js";
import type { AppConfig, CommentNode, FeedType, HNItem, StoryRow } from "../core/types.js";
import { stripHtml, trimLine, unixToRelative } from "../core/utils.js";
import { AlgoliaSearchService } from "../data/algolia.js";
import { FirebaseHNService } from "../data/firebase.js";
import { FileTtlCache } from "../store/ttl-cache.js";

type Pane = "feed" | "search" | "comments";
type SearchMode = "local" | "global";

interface SearchModalState {
  mode: SearchMode;
  value: string;
}

interface AppProps {
  config: AppConfig;
  initialFeed: FeedType;
  initialSearch?: string;
  noCache: boolean;
}

const hn = new FirebaseHNService();
const search = new AlgoliaSearchService();
const cache = new FileTtlCache();

const domainFromUrl = (url?: string): string => {
  if (!url) return "news.ycombinator.com";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function App({ config, initialFeed, initialSearch, noCache }: AppProps) {
  const { width, height } = useTerminalDimensions();

  const [pane, setPane] = useState<Pane>("feed");
  const [feed, setFeed] = useState<FeedType>(initialFeed);
  const [feedIds, setFeedIds] = useState<number[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [searchResults, setSearchResults] = useState<StoryRow[]>([]);
  const [searchCursor, setSearchCursor] = useState(0);
  const [activeStory, setActiveStory] = useState<StoryRow | null>(null);
  const [commentTree, setCommentTree] = useState<CommentNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [flatComments, setFlatComments] = useState<CommentNode[]>([]);
  const [commentCursor, setCommentCursor] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
  const [searchModal, setSearchModal] = useState<SearchModalState | null>(null);
  const [status, setStatus] = useState("Loading Hacker News feed...");
  const [loading, setLoading] = useState(false);
  const [pendingG, setPendingG] = useState(false);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [localMatches, setLocalMatches] = useState<number[]>([]);
  const [localMatchIndex, setLocalMatchIndex] = useState(0);

  const headerHeight = Math.max(1, Math.floor(height * 0.05));
  const footerHeight = Math.max(1, Math.floor(height * 0.05));
  const contentHeight = Math.max(1, height - headerHeight - footerHeight);

  const currentList = pane === "search" ? searchResults : stories;
  const currentCursor = pane === "search" ? searchCursor : cursor;

  const getCached = useCallback(
    async <T,>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> => {
      if (noCache) return loader();
      const hit = await cache.get<T>(key);
      if (hit) return hit;
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
    if (item.url) row.url = item.url;
    return row;
  }, []);

  const markRead = useCallback((storyId: number) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(storyId);
      return next;
    });
  }, []);

  const selectedStory = useMemo(() => {
    if (pane === "feed") return stories[cursor] ?? null;
    if (pane === "search") return searchResults[searchCursor] ?? null;
    return activeStory;
  }, [activeStory, cursor, pane, searchCursor, searchResults, stories]);

  const itemBlockHeight = pane === "comments" ? 1 : 3;
  const visibleItems = Math.max(1, Math.floor((contentHeight - 4) / itemBlockHeight));

  const feedWindow = useMemo(() => {
    const start = Math.max(0, currentCursor - Math.floor(visibleItems / 2));
    const end = Math.min(currentList.length, start + visibleItems);
    return { start, rows: currentList.slice(start, end) };
  }, [currentCursor, currentList, visibleItems]);

  const commentsWindow = useMemo(() => {
    const start = Math.max(0, commentCursor - Math.floor(visibleItems / 2));
    const end = Math.min(flatComments.length, start + visibleItems);
    return { start, rows: flatComments.slice(start, end) };
  }, [commentCursor, flatComments, visibleItems]);

  const refreshFeed = useCallback(
    async (targetFeed: FeedType, resetCursor = true) => {
      setLoading(true);
      setStatus(`Loading ${targetFeed}...`);
      try {
        const ids = await getCached(`feed:${targetFeed}`, config.cacheTtlSeconds.feed, async () => hn.getFeedIds(targetFeed));
        setFeedIds(ids);
        setFeed(targetFeed);
        setPane("feed");
        if (resetCursor) setCursor(0);

        const firstIds = ids.slice(0, config.chunkSize);
        const items = await Promise.all(
          firstIds.map((id) => getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => hn.getItem(id)))
        );

        const rows = items.map((item) => (item ? toStoryRow(item) : null)).filter((row): row is StoryRow => Boolean(row));
        setStories(rows);
        setStatus(`${targetFeed.toUpperCase()} ${rows.length}/${ids.length}`);
      } catch (error) {
        setStatus(`Feed load failed: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.feed, config.cacheTtlSeconds.item, config.chunkSize, getCached, toStoryRow]
  );

  const loadMore = useCallback(async () => {
    if (loading || stories.length >= feedIds.length) return;
    setLoading(true);
    try {
      const ids = feedIds.slice(stories.length, stories.length + config.chunkSize);
      const items = await Promise.all(
        ids.map((id) => getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => hn.getItem(id)))
      );
      const rows = items.map((item) => (item ? toStoryRow(item) : null)).filter((row): row is StoryRow => Boolean(row));
      setStories((prev) => [...prev, ...rows]);
      setStatus(`Loaded ${Math.min(stories.length + rows.length, feedIds.length)} of ${feedIds.length}`);
    } catch (error) {
      setStatus(`Could not load more stories: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [config.cacheTtlSeconds.item, config.chunkSize, feedIds, getCached, loading, stories.length, toStoryRow]);

  const runSearch = useCallback(
    async (query: string) => {
      const cleaned = query.trim();
      if (!cleaned) {
        setStatus("Search query is empty.");
        return;
      }
      setLoading(true);
      setStatus(`Searching for \"${cleaned}\"...`);
      try {
        const page = await getCached(`search:${cleaned}:0`, config.cacheTtlSeconds.search, async () => search.search(cleaned, 0));
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
            const resolved = hit.url ?? hit.story_url;
            if (resolved) row.url = resolved;
            return row;
          })
          .filter((row): row is StoryRow => Boolean(row));

        setSearchQuery(cleaned);
        setSearchResults(rows);
        setSearchCursor(0);
        setPane("search");
        setStatus(`Found ${rows.length} results for \"${cleaned}\".`);
      } catch (error) {
        setStatus(`Search failed: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.search, getCached]
  );

  const runLocalSearch = useCallback(
    (query: string) => {
      const cleaned = query.trim().toLowerCase();
      if (!cleaned) {
        setLocalMatches([]);
        setStatus("Local search cleared.");
        return;
      }

      const matches = stories
        .map((story, idx) => ({ idx, hit: story.title.toLowerCase().includes(cleaned) }))
        .filter((row) => row.hit)
        .map((row) => row.idx);

      setLocalMatches(matches);
      setLocalMatchIndex(0);
      if (matches.length > 0) {
        setCursor(matches[0]!);
        setPane("feed");
        setStatus(`Local matches: ${matches.length}`);
      } else {
        setStatus("No local matches.");
      }
    },
    [stories]
  );

  const loadComments = useCallback(
    async (story: StoryRow) => {
      setLoading(true);
      setStatus(`Loading comments for ${story.id}...`);
      try {
        const root = await getCached(`item:${story.id}`, config.cacheTtlSeconds.item, async () => hn.getItem(story.id));
        const queue = [...(root?.kids ?? [])];
        const visited = new Set<number>();
        const map: Record<number, HNItem> = {};

        while (queue.length > 0) {
          const id = queue.shift();
          if (!id || visited.has(id)) continue;
          visited.add(id);

          const item = await getCached(`item:${id}`, config.cacheTtlSeconds.item, async () => hn.getItem(id));
          if (!item) continue;
          map[item.id] = item;
          for (const kid of item.kids ?? []) {
            if (!visited.has(kid)) queue.push(kid);
          }
        }

        const tree = buildCommentTree(root?.kids ?? [], map);
        const flat = flattenCommentTree(tree, new Set());

        setActiveStory(story);
        setCommentTree(tree);
        setCollapsed(new Set());
        setFlatComments(flat);
        setCommentCursor(0);
        setPane("comments");
        setStatus(`Comments loaded: ${flat.length}`);
      } catch (error) {
        setStatus(`Comment load failed: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [config.cacheTtlSeconds.item, getCached]
  );

  const setCollapse = useCallback(
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

  const openSelected = useCallback(
    (onHn: boolean) => {
      if (!selectedStory) return;
      const target = onHn
        ? `https://news.ycombinator.com/item?id=${selectedStory.id}`
        : (selectedStory.url ?? `https://news.ycombinator.com/item?id=${selectedStory.id}`);

      const ok = openExternal(target);
      if (ok) {
        markRead(selectedStory.id);
        setStatus(`Opened: ${target}`);
      } else {
        setStatus("Could not launch browser.");
      }
    },
    [markRead, selectedStory]
  );

  const exitApp = useCallback(() => {
    clearTerminal();
    process.exit(0);
  }, []);

  useEffect(() => {
    void refreshFeed(initialFeed, true);
  }, [initialFeed, refreshFeed]);

  useEffect(() => {
    if (initialSearch) {
      void runSearch(initialSearch);
    }
  }, [initialSearch, runSearch]);

  useEffect(() => {
    if (pane === "feed" && cursor >= stories.length - 2 && stories.length < feedIds.length) {
      void loadMore();
    }
  }, [cursor, feedIds.length, loadMore, pane, stories.length]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      exitApp();
      return;
    }

    if (searchModal) {
      if (key.name === "escape") {
        setSearchModal(null);
        setStatus("Search canceled.");
      }
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      if (pane === "comments" || pane === "search") {
        setPane("feed");
        setStatus("Back to feed.");
      } else {
        exitApp();
      }
      return;
    }

    if (key.name === "r") {
      void refreshFeed(feed, false);
      return;
    }

    if (key.name === "/") {
      setSearchModal({ mode: "local", value: "" });
      return;
    }

    if (key.name === "?") {
      setSearchModal({ mode: "global", value: searchQuery });
      return;
    }

    if (key.name === "n" && localMatches.length > 0) {
      const next = (localMatchIndex + 1) % localMatches.length;
      setLocalMatchIndex(next);
      setCursor(localMatches[next]!);
      setPane("feed");
      return;
    }

    if (key.name === "n" && key.shift && localMatches.length > 0) {
      const next = (localMatchIndex - 1 + localMatches.length) % localMatches.length;
      setLocalMatchIndex(next);
      setCursor(localMatches[next]!);
      setPane("feed");
      return;
    }

    if (key.name === "g" && key.shift) {
      if (pane === "feed") setCursor(Math.max(0, stories.length - 1));
      if (pane === "search") setSearchCursor(Math.max(0, searchResults.length - 1));
      if (pane === "comments") setCommentCursor(Math.max(0, flatComments.length - 1));
      return;
    }

    if (key.name === "g") {
      if (pendingG) {
        if (pane === "feed") setCursor(0);
        if (pane === "search") setSearchCursor(0);
        if (pane === "comments") setCommentCursor(0);
        setPendingG(false);
      } else {
        setPendingG(true);
        setTimeout(() => setPendingG(false), 350);
      }
      return;
    }

    if (key.name.length === 1 && /[1-6]/.test(key.name)) {
      const idx = Number.parseInt(key.name, 10) - 1;
      const selectedFeed = FEEDS[idx];
      if (selectedFeed) void refreshFeed(selectedFeed, true);
      return;
    }

    if (key.name === "return") {
      openSelected(false);
      return;
    }

    if (key.name === "k" && key.shift) {
      openSelected(true);
      return;
    }

    if (pane === "feed" || pane === "search") {
      if (key.name === "j" || key.name === "down") {
        if (pane === "feed") setCursor((prev) => Math.min(prev + 1, Math.max(0, stories.length - 1)));
        if (pane === "search") setSearchCursor((prev) => Math.min(prev + 1, Math.max(0, searchResults.length - 1)));
      }

      if (key.name === "k" || key.name === "up") {
        if (pane === "feed") setCursor((prev) => Math.max(prev - 1, 0));
        if (pane === "search") setSearchCursor((prev) => Math.max(prev - 1, 0));
      }

      if (key.name === "c" && selectedStory) {
        void loadComments(selectedStory);
      }

      if (key.name === "space" && pane === "feed") {
        void loadMore();
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
        if (current && current.children.length > 0) setCollapse(current.id, true);
      }
      if (key.name === "l") {
        const current = flatComments[commentCursor];
        if (current) setCollapse(current.id, false);
      }
    }
  });

  const shortcuts =
    "j/k move | gg/G top-bottom | Enter open link | Shift+K open HN page | c comments | / local ? global | 1-6 feeds | q quit";

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#111111">
      <box height={headerHeight} justifyContent="center" alignItems="center" paddingX={1}>
        <text fg="#f6a423">Hacker News</text>
      </box>

      <box height={contentHeight} paddingX={2} paddingY={1} flexDirection="column" overflow="hidden">
        <text fg="#888888">{`${feed.toUpperCase()} | pane:${pane} | loaded ${stories.length}/${feedIds.length}`}</text>
        <text fg={loading ? "#d1ad5f" : "#7fa9d8"}>{loading ? "Loading..." : status}</text>
        <text>{""}</text>

        {pane === "comments" ? (
          <box flexDirection="column">
            {activeStory ? <text fg="#dfdfdf">{trimLine(activeStory.title, Math.max(20, width - 8))}</text> : null}
            <text fg="#8a8a8a">h/l collapse-expand</text>
            <text>{""}</text>
            {commentsWindow.rows.length === 0 ? (
              <text fg="#888888">No comments available.</text>
            ) : (
              commentsWindow.rows.map((comment, idx) => {
                const absolute = commentsWindow.start + idx;
                const selected = absolute === commentCursor;
                const marker = selected ? ">" : " ";
                const fold = comment.children.length > 0 ? (collapsed.has(comment.id) ? "[+]" : "[-]") : "[ ]";
                const indent = "  ".repeat(comment.depth);
                const row = `${marker} ${fold} ${indent}${comment.by}: ${trimLine(stripHtml(comment.text), Math.max(20, width - 14))}`;
                return (
                  <text key={`${comment.id}-${absolute}`} fg={selected ? "#e8e8e8" : "#a0a0a0"}>
                    {row}
                  </text>
                );
              })
            )}
          </box>
        ) : (
          <box flexDirection="column">
            {feedWindow.rows.length === 0 ? (
              <text fg="#888888">No stories loaded.</text>
            ) : (
              feedWindow.rows.map((story, idx) => {
                const absolute = feedWindow.start + idx;
                const selected = absolute === currentCursor;
                const read = readIds.has(story.id);
                const titleColor = read ? "#777777" : selected ? "#f2f2f2" : "#d7d7d7";
                const metaColor = read ? "#666666" : "#8f8f8f";
                const domainSuffix = story.url ? ` (${domainFromUrl(story.url)})` : "";
                const titleRoom = Math.max(20, width - 12 - domainSuffix.length);
                const title = `${selected ? ">" : " "} ${absolute + 1}. ${trimLine(story.title, titleRoom)}${domainSuffix}`;
                const meta = `   ${story.score} points by ${story.by} | ${story.comments} comments | ${unixToRelative(story.time)}`;
                return (
                  <box key={`${story.id}-${absolute}`} flexDirection="column">
                    <text fg={titleColor}>{title}</text>
                    <text fg={metaColor}>{trimLine(meta, Math.max(20, width - 6))}</text>
                    <text>{""}</text>
                  </box>
                );
              })
            )}
          </box>
        )}
      </box>

      <box height={footerHeight} justifyContent="center" alignItems="center" paddingX={1}>
        <text fg="#8a8a8a">{trimLine(shortcuts, Math.max(20, width - 4))}</text>
      </box>

      {searchModal ? (
        <box
          position="absolute"
          top={Math.max(1, Math.floor(height * 0.35))}
          left={Math.max(2, Math.floor(width * 0.15))}
          width={Math.max(28, Math.floor(width * 0.7))}
          border
          borderColor="#6b7280"
          backgroundColor="#1c1c1c"
          padding={1}
          zIndex={30}
        >
          <text fg="#c6c6c6">{searchModal.mode === "local" ? "Local search" : "Global search"}</text>
          <input
            focused
            value={searchModal.value}
            placeholder="Type query and press Enter"
            onInput={(value: string) => setSearchModal((prev) => (prev ? { ...prev, value } : prev))}
            onSubmit={(value: string) => {
              if (searchModal.mode === "local") {
                runLocalSearch(value);
              } else {
                void runSearch(value);
              }
              setSearchModal(null);
            }}
          />
          <text fg="#8a8a8a">Enter to submit, Esc to cancel</text>
        </box>
      ) : null}
    </box>
  );
}
