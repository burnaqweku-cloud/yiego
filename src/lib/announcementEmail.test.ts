import { describe, expect, it } from "vitest";
import { announcementEmail, linkOf } from "../../supabase/functions/announce-send/email";

describe("the announcement email", () => {
  it("puts the button straight under the title, before the words", () => {
    const html = announcementEmail("New: result checkers", "Line one\nLine two", linkOf("/services", "Open Services"));
    expect(html.indexOf("New: result checkers")).toBeLessThan(html.indexOf("Open Services"));
    expect(html.indexOf("Open Services")).toBeLessThan(html.indexOf("Line one"));
    expect(html).toContain('href="https://datayego.com/services"');
  });
  it("shows typed text as text, never as markup", () => {
    const html = announcementEmail("<b>Hi</b>", 'Pay <script>x</script> & "go"', null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(html).toContain("&amp;");
  });
  it("only links to our own pages or a full https address", () => {
    expect(linkOf("/agent/services", null)).toEqual({ url: "https://datayego.com/agent/services", label: "Open" });
    expect(linkOf("https://wa.me/233209975451", "Chat")).toEqual({ url: "https://wa.me/233209975451", label: "Chat" });
    expect(linkOf("javascript:alert(1)", "x")).toBeNull();
    expect(linkOf("http://example.com", "x")).toBeNull();
    expect(linkOf(null, null)).toBeNull();
  });
});
