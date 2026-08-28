import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Interndex",
    short_name: "Interndex",
    description: "Save the posting. Track the process.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F6F2",
    theme_color: "#2F4E9E",
    icons: [
      { src: "/brand/favicon/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/favicon/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
