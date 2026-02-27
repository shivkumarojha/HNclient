import { spawn } from "node:child_process";

const browserCommands = (url: string): Array<{ cmd: string; args: string[] }> => {
  if (process.platform === "darwin") {
    return [{ cmd: "open", args: [url] }];
  }
  if (process.platform === "win32") {
    return [{ cmd: "cmd", args: ["/c", "start", "", url] }];
  }
  return [
    { cmd: "xdg-open", args: [url] },
    { cmd: "gio", args: ["open", url] }
  ];
};

export const openExternal = (url: string): boolean => {
  for (const entry of browserCommands(url)) {
    try {
      const child = spawn(entry.cmd, entry.args, {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
};
