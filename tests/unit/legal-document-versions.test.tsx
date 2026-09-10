import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import {
  formatDocumentVersion,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/legal/document-versions";

afterEach(cleanup);

/**
 * The version a page displays and the version signup records must be the
 * same value, read from one place. `tests/unit/signup-consent.test.ts`
 * proves the recording half; this proves the display half, and that the
 * constants themselves are well-formed dates that only ever move forward.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The revision that made deletion and export self-service. */
const SELF_SERVICE_ACCOUNT_REVISION = "2026-09-10";

describe("legal document versions", () => {
  it("are ISO calendar dates", () => {
    expect(TERMS_VERSION).toMatch(ISO_DATE);
    expect(PRIVACY_VERSION).toMatch(ISO_DATE);
  });

  it("are not older than the self-service deletion and export revision", () => {
    // ISO dates compare correctly as strings.
    expect(TERMS_VERSION >= SELF_SERVICE_ACCOUNT_REVISION).toBe(true);
    expect(PRIVACY_VERSION >= SELF_SERVICE_ACCOUNT_REVISION).toBe(true);
  });

  it("render as the effective date on the privacy page", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(
        `Effective date / last updated: ${formatDocumentVersion(PRIVACY_VERSION)}.`,
      ),
    ).toBeInTheDocument();
  });

  it("render as the effective date on the terms page", () => {
    render(<TermsPage />);

    expect(
      screen.getByText(
        `Effective date / last updated: ${formatDocumentVersion(TERMS_VERSION)}.`,
      ),
    ).toBeInTheDocument();
  });
});
