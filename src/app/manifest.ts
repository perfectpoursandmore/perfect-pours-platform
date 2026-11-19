import type { MetadataRoute } from "next";

// Lets Faith (and staff) "Add to Home Screen" so the platform opens like an
// app: its own icon, full screen, no Safari bar. It opens on the Today
// screen (to-dos, calls, events); "+ New" is one tap from there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Perfect Pours & More",
    short_name: "Perfect Pours",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#8a2346",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
