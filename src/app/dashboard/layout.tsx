import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">Job Scanner</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Resumes</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Jobs</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Applications</Link>
          <Link href="/dashboard" className="text-sm text-gray-600">Settings</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <span className="mr-3 text-sm text-gray-600">{session.user.email}</span>
          <button type="submit" className="rounded border px-3 py-1 text-sm">Sign out</button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
