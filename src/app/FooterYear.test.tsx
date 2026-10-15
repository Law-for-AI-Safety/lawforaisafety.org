import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import FooterYear from "./FooterYear";

const BUILT = new Date("2026-12-31T23:00:00Z");
const VISITED = new Date("2027-01-02T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: BUILT });
});

describe("FooterYear", () => {
  it("prerenders the year the site was built", () => {
    expect(renderToString(<FooterYear builtYear={2026} />)).toBe("2026");
  });

  it("shows the visitor's current year once the prerendered footer hydrates", async () => {
    const onRecoverableError = vi.fn();
    const container = document.createElement("p");
    container.innerHTML = renderToString(<FooterYear builtYear={2026} />);
    document.body.append(container);

    vi.setSystemTime(VISITED);
    const root = await act(async () =>
      hydrateRoot(container, <FooterYear builtYear={2026} />, { onRecoverableError }),
    );

    expect(container.textContent).toBe("2027");
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
