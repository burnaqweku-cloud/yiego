/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;

interface Window {
  __lovableEvents?: {
    track?: (event: string, properties?: Record<string, unknown>) => string | null;
  };
}
