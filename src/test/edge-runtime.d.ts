// Minimal environment type for supplier modules imported by the Node-based tests.
declare const Deno: { env: { get(key: string): string | undefined } };