import { describe, expect, it } from "vitest";
import { deliveryOf, jobIdOf, reasonOf, withoutText } from "../../supabase/functions/service-pay/delivery";
import { textStatus } from "./smsDelivery";

describe("reading the SMS provider's delivery report", () => {
  it("reads the status word wherever it sits (shapes the provider has really sent)", () => {
    expect(deliveryOf({ data: { sender: "DTYEGO", status: "DELIVERED", delivered_at: "2026-10-31T08:30:28" }, event: "delivered" })).toBe("delivered");
    expect(deliveryOf({ data: { status: "NOT_DELIVERED", delivered_at: null }, event: "failed" })).toBe("not_delivered");
    expect(deliveryOf({ success: true, data: { messages: [{ status: "SENT" }] } })).toBe("sent");
    expect(deliveryOf({ status: "success", data: { status: "PENDING" } })).toBe("pending");
    expect(deliveryOf({ data: { messages: [{ status: "pending" }, { status: "undelivered" }] } })).toBe("not_delivered");
    expect(deliveryOf({ data: { status: "REJECTED" } })).toBe("failed");
  });
  it("never guesses: an empty reply, an error reply or an unknown word is 'unknown'", () => {
    expect(deliveryOf(null)).toBe("unknown");
    expect(deliveryOf({})).toBe("unknown");
    expect(deliveryOf({ success: false, status: "failed", message: "Task not found" })).toBe("unknown");
    expect(deliveryOf({ status: "success" })).toBe("unknown");
  });
  it("picks up the provider's reason and its job id", () => {
    expect(reasonOf({ data: { messages: [{ status: "FAILED", error_message: "Absent subscriber" }] } })).toBe("Absent subscriber");
    expect(reasonOf({ data: { status: "DELIVERED" } })).toBeNull();
    expect(jobIdOf({ success: true, data: { job_id: "abc-123" } })).toBe("abc-123");
    expect(jobIdOf({ task_id: 42 })).toBe("42");
    expect(jobIdOf({ success: true })).toBeNull();
  });
  it("drops any copy of the text before the reply is kept (a text can carry a PIN)", () => {
    const kept = JSON.stringify(withoutText({ data: { status: "SENT", message: "S/N 1 PIN 2", messages: [{ text: "PIN 2", status: "SENT" }] }, message: "ok" }));
    expect(kept).not.toContain("PIN");
    expect(kept).toContain("SENT");
  });
});

describe("how the admin sees one text", () => {
  const now = new Date("2026-11-13T09:00:00Z").getTime();
  const base = { accepted: true, refusal: null, delivery: "pending", delivery_reason: null, sent_at: "2026-11-13T08:59:00Z" };
  it("says delivered only when the network said so", () => {
    expect(textStatus({ ...base, delivery: "delivered" }, now)).toMatchObject({ label: "Delivered", tone: "good" });
  });
  it("tells sent-and-waiting from sent-and-not-delivered", () => {
    expect(textStatus(base, now)).toMatchObject({ label: "Sent, waiting for the report", tone: "muted" });
    expect(textStatus({ ...base, sent_at: "2026-11-13T08:57:30Z" }, now)).toMatchObject({ label: "Sent, not delivered", tone: "bad" });
    expect(textStatus({ ...base, delivery: "not_delivered" }, now)).toMatchObject({ label: "Sent, not delivered", tone: "bad" });
    expect(textStatus({ ...base, delivery: "failed", delivery_reason: "Absent subscriber" }, now)).toMatchObject({ label: "Sent, not delivered", note: "Absent subscriber" });
  });
  it("says so when the provider never took the text", () => {
    expect(textStatus({ ...base, accepted: false, refusal: "402 Insufficient credits", delivery: "failed" }, now)).toMatchObject({ label: "Not sent", tone: "bad", note: "402 Insufficient credits" });
  });
});
