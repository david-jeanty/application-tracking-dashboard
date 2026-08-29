import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { AppearanceSync } from "@/components/appearance/appearance-sync";
import { appearanceInlineScript } from "@/lib/appearance/inline-script";
import "./globals.css";

/**
 * IBM Plex Sans carries the interface. The Interndex wordmark itself is
 * supplied raster artwork and does not depend on a browser font.
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

export const metadata: Metadata = {
  title: {
    default: "Interndex",
    template: "%s · Interndex",
  },
  description: "Save the posting. Track the process.",
  applicationName: "Interndex",
  openGraph: {
    title: "Interndex",
    description: "Save the posting. Track the process.",
    siteName: "Interndex",
  },
  icons: {
    icon: [
      { url: "/brand/favicon/favicon.ico" },
      { url: "/brand/favicon/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/brand/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
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
      className={plexSans.variable}
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
