// Minimal environment type for supplier modules imported by the Node-based tests.
export {};
declare global {
  const Deno: { env: { get(key: string): string | undefined } };
}