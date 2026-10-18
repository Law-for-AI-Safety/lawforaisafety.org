import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "../../../../test/next-navigation";
import EndSessionsButton from "./EndSessionsButton";

describe("EndSessionsButton", () => {
  it("does nothing unless confirmed", () => {
    const endSessions = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EndSessionsButton email="kim@example.com" name="Kim" isYou={false} endSessions={endSessions} />);
    fireEvent.click(screen.getByRole("button", { name: "End sessions" }));
    expect(endSessions).not.toHaveBeenCalled();
  });

  it("sends the person who ends their own sessions to the login page", async () => {
    const endSessions = vi.fn().mockResolvedValue({ ok: true, ended: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EndSessionsButton email="tess@example.com" name="Tess" isYou={true} endSessions={endSessions} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "End my sessions" })));
    expect(confirm).toHaveBeenCalledWith("End all your sessions, including this one? You will be logged out everywhere.");
    expect(endSessions).toHaveBeenCalledWith("tess@example.com");
    expect(navigation.push).toHaveBeenCalledWith("/admin/login");
  });

  it("says why it could not end them", async () => {
    const endSessions = vi.fn().mockResolvedValue({ ok: false, message: "Only technical admins can end sessions." });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EndSessionsButton email="kim@example.com" name="Kim" isYou={false} endSessions={endSessions} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "End sessions" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Only technical admins can end sessions.");
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
