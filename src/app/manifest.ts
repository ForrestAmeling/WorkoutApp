import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reps",
    short_name: "Reps",
    description: "Log sets and get AI starting-weight suggestions.",
    start_url: "/today",
    display: "standalone",
    background_color: "#eef2f0",
    theme_color: "#d6ff3f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
