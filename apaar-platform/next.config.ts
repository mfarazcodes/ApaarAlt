import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next.js inlines small scripts and styles, and the theme script in layout.tsx is inline, so 'unsafe-inline'
// is needed without a nonce setup (see the Next.js content-security-policy guide). 'unsafe-eval' is development only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const common = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // The camera is off everywhere except the employer verifier, which scans QR codes.
      { source: "/:path*", headers: [...common, { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }] },
      { source: "/employer/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" }] },
    ];
  },
};

export default nextConfig;
