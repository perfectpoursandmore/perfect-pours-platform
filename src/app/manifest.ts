import type { MetadataRoute } from "next";

// Lets Faith (and staff) "Add to Home Screen" so the platform opens like an
// app: its own icon, full screen, no Safari bar. It opens straight into
// Quick Add, so logging a call or text is tap → type → save.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Perfect Pours & More",
    short_name: "Perfect Pours",
    start_url: "/admin/calendar?quickadd=1",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
