#!/usr/bin/env node
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "../app/App.js";
import { FEEDS } from "../core/constants.js";
import { clearTerminal } from "../core/terminal.js";
import type { FeedType } from "../core/types.js";
import { loadConfig } from "../store/config-store.js";
import { ensureAppDirs } from "../store/xdg.js";

interface CliArgs {
  feed?: FeedType;
  search?: string;
  noCache?: boolean;
}

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--feed") {
      const next = argv[i + 1] as FeedType | undefined;
      if (next && FEEDS.includes(next)) {
        out.feed = next;
      }
      i += 1;
      continue;
    }
    if (arg === "--search") {
      out.search = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--no-cache") {
      out.noCache = true;
    }
  }
  return out;
};

const main = async () => {
  let shuttingDown = false;
  let root: { unmount: () => void } | null = null;
  let rendererRef: { destroy: () => void } | null = null;

  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      root?.unmount();
    } catch {
      // no-op during shutdown
    }

    try {
      rendererRef?.destroy();
    } catch {
      // no-op during shutdown
    }

    try {
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
    } catch {
      // no-op during shutdown
    }

    clearTerminal();
    process.exit(code);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await ensureAppDirs();
  const config = await loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const initialFeed = args.feed ?? config.defaultFeed;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false
  });
  rendererRef = renderer as { destroy: () => void };

  const appProps = {
    config,
    initialFeed,
    noCache: Boolean(args.noCache)
  } as const;

  const renderRoot = createRoot(renderer);
  root = renderRoot;

  renderRoot.render(
    args.search
      ? <App {...appProps} initialSearch={args.search} onRequestExit={() => shutdown(0)} />
      : <App {...appProps} onRequestExit={() => shutdown(0)} />
  );
};

void main();
