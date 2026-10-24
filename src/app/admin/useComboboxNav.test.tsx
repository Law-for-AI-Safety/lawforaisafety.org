import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useComboboxNav } from "./useComboboxNav";

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe("useComboboxNav", () => {
  it("opens and advances the active index on ArrowDown", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.handleKeyDown(keyEvent("ArrowDown"), 3, vi.fn()));
    expect(result.current.open).toBe(true);
    expect(result.current.activeIndex).toBe(1);
  });

  it("wraps from the last item back to the first", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.setActiveIndex(2));
    act(() => result.current.handleKeyDown(keyEvent("ArrowDown"), 3, vi.fn()));
    expect(result.current.activeIndex).toBe(0);
  });

  it("wraps from the first item back to the last on ArrowUp", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.handleKeyDown(keyEvent("ArrowUp"), 3, vi.fn()));
    expect(result.current.activeIndex).toBe(2);
  });

  it("does nothing on arrow keys with no navigable options, besides opening", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.handleKeyDown(keyEvent("ArrowDown"), 0, vi.fn()));
    expect(result.current.open).toBe(true);
    expect(result.current.activeIndex).toBe(0);
  });

  it("selects the active index on Enter while open", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.setOpen(true));
    act(() => result.current.setActiveIndex(1));
    const onSelect = vi.fn();
    act(() => result.current.handleKeyDown(keyEvent("Enter"), 3, onSelect));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("does nothing on Enter while closed", () => {
    const { result } = renderHook(() => useComboboxNav());
    const onSelect = vi.fn();
    act(() => result.current.handleKeyDown(keyEvent("Enter"), 3, onSelect));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does nothing on Enter with no navigable options", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.setOpen(true));
    const onSelect = vi.fn();
    act(() => result.current.handleKeyDown(keyEvent("Enter"), 0, onSelect));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on Escape while open", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.setOpen(true));
    act(() => result.current.handleKeyDown(keyEvent("Escape"), 3, vi.fn()));
    expect(result.current.open).toBe(false);
  });

  it("resets the active index back to 0", () => {
    const { result } = renderHook(() => useComboboxNav());
    act(() => result.current.setActiveIndex(2));
    act(() => result.current.reset());
    expect(result.current.activeIndex).toBe(0);
  });
});
