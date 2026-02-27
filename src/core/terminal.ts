export const clearTerminal = (): void => {
  process.stdout.write("\x1b[?1049l\x1b[2J\x1b[3J\x1b[H\x1b[0m");
};
