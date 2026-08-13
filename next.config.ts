import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "100.100.27.10",
  ],
  async headers() {
    return [
      {
        source: "/pioneer/sos-map",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ],
      },
      {
        source: "/api/pioneer/sos-rescue",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ],
      },
    ];
  },
};

export default nextConfig;
