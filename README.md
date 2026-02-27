# hnclient

A keyboard-first Hacker News terminal client built with TypeScript + OpenTUI.

## Highlights

- Fully keyboard-driven workflow (no mouse required)
- Vim-style movement (`j/k`, `gg`, `G`)
- Breathable card-style story layout with color accents
- Read-state dimming (opened stories become gray)
- Centered Hacker News header + footer shortcut bar
- Modal search input boxes using OpenTUI input component
  - `/` local search in current feed
  - `?` global Algolia search
- `Enter` opens selected story directly in your system browser
- `Shift+K` opens selected story on `news.ycombinator.com/item?id=...`
- `c` opens threaded comments in terminal
- Terminal is cleared on exit (`q`/`Ctrl+C`)

## Runtime Requirement

OpenTUI depends on Bun runtime APIs, so you need Bun installed:

- Install: https://bun.sh

The global `hn` command is a launcher script that runs the compiled app with Bun.

## Install (Local)

```bash
npm install
npm run build
npm link
```

Run:

```bash
hn --feed top
```

## Usage

```bash
hn --feed new
hn --search "postgres"
hn --no-cache
```

## Keybindings

- `j/k` or arrows: move selection
- `gg` / `G`: jump to top / bottom
- `Enter`: open selected story in browser
- `Shift+K`: open selected story on HN item page
- `c`: open comments view
- `h/l`: collapse or expand comment node
- `/`: local search modal (current feed)
- `?`: global search modal (Algolia)
- `n` / `N`: next / previous local match
- `1..6`: switch feeds (`top`, `new`, `best`, `ask`, `show`, `job`)
- `r`: refresh feed
- `q` or `Esc`: back/quit
- `Ctrl+C`: quit and clear terminal

## Config and Cache

- Config: `~/.config/hnclient/config.json`
- Cache: `~/.cache/hnclient/cache.json`

## Build and Test

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Publish to npm

1. Ensure you are logged in:
```bash
npm login
```

2. Pick a unique package name in `package.json` (current `hnclient` may already be taken).

3. Bump version:
```bash
npm version patch
```

4. Build and verify:
```bash
npm run typecheck
npm run test
npm run build
```

5. Publish:
```bash
npm publish --access public
```

If you publish under an npm scope (for example `@yourname/hnclient`), update `name` in `package.json` and publish with:

```bash
npm publish --access public
```
