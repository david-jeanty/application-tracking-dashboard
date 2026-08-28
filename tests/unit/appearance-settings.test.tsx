import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance/appearance";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const { AppearanceSettings } = await import(
  "@/components/settings/appearance-settings"
);

function stored() {
  const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("data-accent");
});

describe("the controls that are offered", () => {
  it("offers every mode as a labelled choice", () => {
    render(<AppearanceSettings />);
    const modes = screen.getByRole("radiogroup", { name: "Mode" });

    expect(
      within(modes).getAllByRole("radio").map((radio) => radio.textContent),
    ).toEqual(["System", "Light", "Dark"]);
  });

  it("names every accent, so the choice is not made by colour alone", () => {
    render(<AppearanceSettings />);
    const accents = screen.getByRole("radiogroup", { name: "Accent" });

    expect(
      within(accents)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-label")),
    ).toEqual(["Interndex Blue", "Rose", "Violet", "Emerald"]);
  });
});

describe("reporting the current preference", () => {
  it("reports the stored choice once it has been read", async () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ mode: "dark", accent: "violet" }),
    );

    render(<AppearanceSettings />);

    expect(await screen.findByRole("radio", { name: "Dark", checked: true }))
      .toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "Violet", checked: true }))
      .toBeInTheDocument();
  });

  it("reports the defaults when nothing has been stored", async () => {
    render(<AppearanceSettings />);

    expect(await screen.findByRole("radio", { name: "System", checked: true }))
      .toBeInTheDocument();
    expect(
      await screen.findByRole("radio", { name: "Interndex Blue", checked: true }),
    ).toBeInTheDocument();
  });
});

describe("changing the preference", () => {
  it("remembers a chosen mode", () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(stored()).toEqual({ mode: "dark", accent: "blue" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("remembers a chosen accent", () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole("radio", { name: "Rose" }));

    expect(stored()).toEqual({ mode: "system", accent: "rose" });
    expect(document.documentElement.dataset.accent).toBe("rose");
  });

  it("keeps mode and accent independent of one another", () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.click(screen.getByRole("radio", { name: "Emerald" }));

    expect(stored()).toEqual({ mode: "dark", accent: "emerald" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("emerald");
  });

  it("stores only the preference, not internal bookkeeping", () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(Object.keys(stored() as object).sort()).toEqual(["accent", "mode"]);
  });
});
