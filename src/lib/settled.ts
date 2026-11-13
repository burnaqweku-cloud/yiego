/* A database call (supabase-js) is "thenable", not a real Promise: it has .then() and nothing else. Calling .catch()
   on one throws, there and then, and takes down whatever was waiting beside it (on 13 Nov 2026 that left the admin
   Overview on dashes). `settled` is the safe way to give one call a fallback. */

/** The call's answer, or `fallback` if it failed. Never rejects, so one part of a page can't stop the rest from showing. */
export const settled = <T,>(call: PromiseLike<T>, fallback: T): Promise<T> => Promise.resolve(call).then((r) => r, () => fallback);
