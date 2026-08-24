import type { Metadata } from "next";
import { appearanceInlineScript } from "@/lib/appearance/inline-script";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: appearanceInlineScript() }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
