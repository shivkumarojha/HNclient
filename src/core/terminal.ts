const TERMINAL_RESET =
  "\x1b[?1000l" + // mouse button tracking off
  "\x1b[?1002l" + // mouse drag tracking off
  "\x1b[?1003l" + // mouse motion tracking off
  "\x1b[?1004l" + // focus event reporting off
  "\x1b[?1005l" + // UTF-8 mouse mode off
  "\x1b[?1006l" + // SGR mouse mode off
  "\x1b[?1015l" + // urxvt mouse mode off
  "\x1b[?2004l" + // bracketed paste off
  "\x1b[?1049l" + // alternate screen off
  "\x1b[?25h" + // cursor visible
  "\x1b[0m"; // reset attributes

export const clearTerminal = (options: { clearScreen?: boolean } = {}): void => {
  const { clearScreen = true } = options;
  const clear = clearScreen ? "\x1b[2J\x1b[3J\x1b[H" : "\x1b[H";
  process.stdout.write(`${TERMINAL_RESET}${clear}`);
};
