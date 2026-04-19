import { Sidebar } from "@/components/Sidebar";
import { TokenMeter } from "@/components/TokenMeter";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Sidebar />
      <TokenMeter />
      <main className="pl-64 h-screen overflow-y-auto w-full relative z-10 p-8">
        {children}
      </main>
    </>
  );
}
