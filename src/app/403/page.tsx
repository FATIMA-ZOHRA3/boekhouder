import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">No access</h1>
      <p className="max-w-md text-gray-600">
        You don't have permission to view this page.
      </p>
      <Link
        href="/"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Back to home
      </Link>
    </div>
  );
}
