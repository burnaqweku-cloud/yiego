import { afterEach, expect, it, vi } from "vitest";

declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

afterEach(() => vi.unstubAllGlobals());

it("sends the approved Datayego sender to the owner-approved Ghana test number", async () => {
  vi.stubGlobal("Deno", { env: { get: (name: string) => name === "VYNFY_API_KEY" ? "test-only-key" : undefined } });
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { job_id: "test" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { sendSms } = await import("../../supabase/functions/_shared/sms");
  expect(await sendSms({ to: "+233557375894", message: "Sample" })).toMatchObject({ ok: true });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.sender).toBe("Datayego");
  expect(body.recipients).toEqual(["233557375894"]);
});