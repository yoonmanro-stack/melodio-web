import { AppShell } from "@/components/layout/AppShell";
import { getMugSoundAccess } from "@/lib/mugsound/access";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getMugSoundAccess();
  return <AppShell showMugSoundSupply={Boolean(access)}>{children}</AppShell>;
}
