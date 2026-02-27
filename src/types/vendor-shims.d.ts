declare module "@opentui/react" {
  export function createRoot(renderer: unknown): {
    render(node: unknown): void;
    unmount(): void;
  };
  export function useKeyboard(handler: (key: {
    name: string;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
  }) => void): void;
  export function useTerminalDimensions(): { width: number; height: number };
}

declare module "@opentui/core" {
  export function createCliRenderer(config?: { exitOnCtrlC?: boolean }): Promise<unknown>;
}

declare module "html-to-text" {
  export function convert(input: string, options?: Record<string, unknown>): string;
}
