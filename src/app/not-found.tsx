import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-serif text-2xl font-semibold">That page isn’t in the manuscript.</p>
      <Link href="/dashboard" className="text-accent hover:underline">
        Back to your manuscripts
      </Link>
    </main>
  );
}
