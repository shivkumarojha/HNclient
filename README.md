# hnclient

Keyboard-first Hacker News terminal client built with OpenTUI and TypeScript.

Runtime requirement: Bun (OpenTUI core depends on Bun runtime APIs).

## Features

- Full keyboard navigation (no mouse required)
- Vim-like motions: `j/k`, `gg`, `G`, `q`
- Feed parity via official Firebase feeds: `top`, `new`, `best`, `ask`, `show`, `job`
- Global search via Algolia HN API (`?`)
- Local search inside loaded feed (`/`)
- Threaded comments with collapse/expand (`h`/`l`)
- In-terminal article rendering (`o`)
- XDG config/cache persistence

## Install

```bash
npm install
npm run build
npm link
```

Then run:

```bash
hn
```

## Usage

```bash
hn --feed top
hn --search "postgres"
hn --no-cache
```

## Keybindings

- `j/k` or `up/down`: move
- `gg` / `G`: top / bottom
- `/`: local search in current feed
- `?`: global search (Algolia)
- `n` / `N`: next/previous local match
- `Enter`: open comments
- `o`: open article in terminal
- `h` / `l`: collapse/expand comment thread
- `1..6`: switch feeds (`top/new/best/ask/show/job`)
- `r`: refresh current feed
- `q` or `Esc`: back or quit

## Storage

- Config: `~/.config/hnclient/config.json`
- Cache: `~/.cache/hnclient/cache.json`

## Notes

- Authenticated write actions (login/vote/comment/post) are intentionally not implemented in v1.
- v1 is read-only and uses official feed APIs plus Algolia search.
