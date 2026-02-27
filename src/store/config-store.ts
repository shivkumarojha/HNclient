import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../core/constants.js";
import type { AppConfig } from "../core/types.js";
import { ensureAppDirs, appDirs } from "./xdg.js";

const configPath = join(appDirs.configDir, "config.json");

export const loadConfig = async (): Promise<AppConfig> => {
  await ensureAppDirs();
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      cacheTtlSeconds: {
        ...DEFAULT_CONFIG.cacheTtlSeconds,
        ...parsed.cacheTtlSeconds
      }
    };
  } catch {
    await saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
  await ensureAppDirs();
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
};
