import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { AppearanceSync } from "@/components/appearance/appearance-sync";
import { appearanceInlineScript } from "@/lib/appearance/inline-script";
import "./globals.css";

/**
 * IBM Plex Sans carries the whole interface; IBM Plex Serif carries only the
 * JobTrack wordmark.
 *
 * Two weights of the sans, deliberately: the design leans on size and colour
 * for hierarchy rather than on weight, so regular and medium are all it needs.
 * `next/font` self-hosts both at build time, so there is no render-blocking
 * request to Google and no font file committed to the repository.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-serif",
});

export const metadata: Metadata = {
  title: {
    default: "JobTrack",
    template: "%s · JobTrack",
  },
  description: "A focused internship and co-op application tracker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The appearance script writes `data-theme`, `data-mode` and `data-accent`
    // onto this element before hydration, which React would otherwise report
    // as a server/client mismatch.
    <html
      className={`${plexSans.variable} ${plexSerif.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: appearanceInlineScript() }}
        />
      </head>
      <body>
        <AppearanceSync />
        {children}
      </body>
    </html>
  );
}
