import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const offer = vi.hoisted(() => ({ show: true, device: "android" as "android" | "iphone" | "other" }));
vi.mock("@/lib/appInstall", () => ({ useAppOffer: () => ({ ...offer, version: null }) }));
import AgentAppBar from "./AgentAppBar";
import { REST_MS } from "@/lib/agentAppBar";

const show = () => render(<MemoryRouter><AgentAppBar /></MemoryRouter>);

describe("the app strip in the agent dashboard", () => {
  beforeEach(() => { localStorage.clear(); offer.show = true; offer.device = "android"; });

  it("offers the app and leads to the app page", () => {
    show();
    expect(screen.getByText("DataYego app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download the DataYego app" })).toHaveAttribute("href", "/app");
  });
  it("speaks of the home screen on an iPhone", () => {
    offer.device = "iphone";
    show();
    expect(screen.getByText("Add it to your home screen")).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
  });
  it("goes away when closed, and is still away on the next page", () => {
    const first = show();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    expect(show().container).toBeEmptyDOMElement();
  });
  it("is back the next day", () => {
    localStorage.setItem("yg-agent-appbar", JSON.stringify({ closes: 1, until: Date.now() - 1 }));
    show();
    expect(screen.getByText("DataYego app")).toBeInTheDocument();
    expect(REST_MS).toBe(24 * 3600 * 1000);
  });
  it("never shows where the app cannot be offered (in the app, already installed, on a computer)", () => {
    offer.show = false;
    expect(show().container).toBeEmptyDOMElement();
  });
});
