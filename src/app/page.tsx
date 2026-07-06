import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">Job Scanner</h1>
      <p className="text-gray-600">
        Upload your resume, scan the market for matching jobs, and tailor your
        resume to each application — honestly.
      </p>
      <div className="flex gap-3">
        <Link href="/signup" className="rounded bg-black px-4 py-2 text-white">Get started</Link>
        <Link href="/signin" className="rounded border px-4 py-2">Sign in</Link>
      </div>
    </main>
  );
}
