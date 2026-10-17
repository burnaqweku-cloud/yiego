import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Writable } from "node:stream";
import { MainSite } from "./App";

/* Build-time pre-rendering of the public pages (vite.config.ts → prerenderRoutes). Renders the same tree the
   browser hydrates, with the catalogue snapshot as data, so every indexable URL ships with its real headline, text,
   prices and structured data in the HTML. Lazy pages are awaited (onAllReady), so no Suspense fallbacks leak out. */
export function render(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _enc, cb) { html += chunk.toString(); cb(); },
      final(cb) { resolve(html); cb(); },
    });
    const stream = renderToPipeableStream(
      <StrictMode><StaticRouter location={url}><MainSite /></StaticRouter></StrictMode>,
      {
        onAllReady() { stream.pipe(sink); },
        onError(err) { reject(err); },
      },
    );
    setTimeout(() => reject(new Error(`prerender timeout: ${url}`)), 20000).unref?.();
  });
}
