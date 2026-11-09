import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import BottomNav from "@/components/BottomNav";
import WarningOverlay from "@/components/WarningOverlay";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-page text-ink">
      <Sidebar user={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session} />
        <main className="flex-1 p-4 pb-24 md:p-6">{children}</main>
      </div>
      <BottomNav />
      <WarningOverlay />
    </div>
  );
}
