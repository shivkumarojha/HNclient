import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const fallbackConfig = join(homedir(), ".config");
const fallbackCache = join(homedir(), ".cache");

export const appDirs = {
  configDir: join(process.env.XDG_CONFIG_HOME ?? fallbackConfig, "hnclient"),
  cacheDir: join(process.env.XDG_CACHE_HOME ?? fallbackCache, "hnclient")
};

export const ensureAppDirs = async (): Promise<void> => {
  await mkdir(appDirs.configDir, { recursive: true });
  await mkdir(appDirs.cacheDir, { recursive: true });
};
