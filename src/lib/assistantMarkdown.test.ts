// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assistantHtml } from "./assistantMarkdown";

describe("assistantHtml", () => {
  it("renders paragraphs, bold and inline code", () => {
    expect(assistantHtml("Your order is **delivered**.\n\nCheck `YG-ABC123`."))
      .toBe("<p>Your order is <strong>delivered</strong>.</p><p>Check <code>YG-ABC123</code>.</p>");
  });

  it("renders bullet and numbered lists", () => {
    expect(assistantHtml("- Open Track Order\n- Enter your reference"))
      .toBe("<ul><li>Open Track Order</li><li>Enter your reference</li></ul>");
    expect(assistantHtml("1. Top up\n2. Buy the bundle"))
      .toBe("<ol><li>Top up</li><li>Buy the bundle</li></ol>");
  });

  it("keeps single line breaks inside a paragraph", () => {
    expect(assistantHtml("Line one\nLine two")).toBe("<p>Line one<br>Line two</p>");
  });

  it("links internal paths and https, leaves unsafe schemes as text", () => {
    expect(assistantHtml("[Track Order](/track-order)")).toBe('<p><a href="/track-order">Track Order</a></p>');
    expect(assistantHtml("[site](https://datayego.com)")).toContain('target="_blank"');
    const unsafe = assistantHtml("[x](javascript:alert(1))");
    expect(unsafe).not.toContain("<a");
    expect(unsafe).toContain("[x](javascript:alert(1))");
  });

  it("escapes raw HTML so replies can never inject markup", () => {
    expect(assistantHtml('<img src=x onerror=alert(1)> & <script>hi</script>'))
      .toBe("<p>&lt;img src=x onerror=alert(1)&gt; &amp; &lt;script&gt;hi&lt;/script&gt;</p>");
  });
});
