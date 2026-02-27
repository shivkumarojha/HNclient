#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const clearTerminal = () => {
  process.stdout.write("\x1b[?1049l\x1b[2J\x1b[3J\x1b[H\x1b[0m");
};

const args = process.argv.slice(2);
const script = path.join(__dirname, "..", "dist", "cli", "index.js");

const run = spawnSync("bun", [script, ...args], {
  stdio: "inherit"
});

clearTerminal();

if (run.error) {
  if (run.error.code === "ENOENT") {
    console.error("hnclient requires Bun runtime. Install Bun from https://bun.sh and retry.");
    process.exit(1);
  }
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
