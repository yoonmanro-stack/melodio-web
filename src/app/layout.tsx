import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Melodio | Global AI Music Label SaaS",
  description: "Create your virtual artist and longform playlist videos purely with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen relative overflow-hidden bg-[#09090b]`}>
        <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="h-screen w-full relative z-10 flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
