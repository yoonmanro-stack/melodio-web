import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PasswordGate } from "@/components/PasswordGate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Melodio | Global AI Music Label SaaS",
  description: "Create your virtual artist and longform playlist videos purely with AI.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" crossOrigin="" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" crossOrigin=""></script>
      </head>
      <body className={`${inter.className} min-h-screen relative overflow-hidden bg-[#09090b]`}>
        <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="h-screen w-full relative z-10 flex flex-col">
          <PasswordGate>
            {children}
          </PasswordGate>
        </div>
      </body>
    </html>
  );
}
