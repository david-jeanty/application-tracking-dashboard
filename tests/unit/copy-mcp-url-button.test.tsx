import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyMcpUrlButton } from "@/components/settings/copy-mcp-url-button";

afterEach(cleanup);

describe("copying the connection address", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the exact url it was given", async () => {
    render(<CopyMcpUrlButton url="https://jobtrack.example/api/mcp" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy connection address" }));

    expect(writeText).toHaveBeenCalledWith("https://jobtrack.example/api/mcp");
  });

  it("confirms the copy, then reverts", async () => {
    vi.useFakeTimers();
    try {
      render(<CopyMcpUrlButton url="https://jobtrack.example/api/mcp" />);

      // The clipboard write resolves on a microtask; `act` flushes it
      // before the confirmed label is asserted.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy connection address" }));
      });
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(
        screen.getByRole("button", { name: "Copy connection address" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the button usable when the clipboard is unavailable", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CopyMcpUrlButton url="https://jobtrack.example/api/mcp" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy connection address" }));
    });

    expect(writeText).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Copy connection address" }),
    ).toBeInTheDocument();
  });
});
