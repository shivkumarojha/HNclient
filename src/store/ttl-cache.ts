import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { epochNow } from "../core/utils.js";
import { ensureAppDirs, appDirs } from "./xdg.js";

interface CacheEnvelope<T> {
  expiresAt: number;
  value: T;
}

const cachePath = join(appDirs.cacheDir, "cache.json");

export class FileTtlCache {
  private data: Record<string, CacheEnvelope<unknown>> = {};
  private loaded = false;

  public async load(): Promise<void> {
    if (this.loaded) return;
    await ensureAppDirs();
    try {
      const raw = await readFile(cachePath, "utf8");
      this.data = JSON.parse(raw) as Record<string, CacheEnvelope<unknown>>;
    } catch {
      this.data = {};
    }
    this.loaded = true;
  }

  public async get<T>(key: string): Promise<T | null> {
    await this.load();
    const hit = this.data[key];
    if (!hit) return null;
    if (hit.expiresAt <= epochNow()) {
      delete this.data[key];
      await this.persist();
      return null;
    }
    return hit.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.load();
    this.data[key] = {
      expiresAt: epochNow() + ttlSeconds,
      value
    };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await ensureAppDirs();
    await writeFile(cachePath, JSON.stringify(this.data), "utf8");
  }
}
