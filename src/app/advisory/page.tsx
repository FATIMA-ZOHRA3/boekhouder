import Link from "next/link";

export default function AdvisoryPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-12 max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Kennismakingsgesprek</h1>
        <p className="text-gray-600 mb-8">
          Want to know more about our services? Schedule a no-obligation introductory call
          with one of our accountants.
        </p>
        <div className="bg-emerald-50 rounded-xl p-6 mb-8">
          <p className="text-emerald-800 font-medium">
            The scheduling feature is soon available.
          </p>
          <p className="text-emerald-600 text-sm mt-2">
            In the meantime, contact us at info@boekhouder.nl
          </p>
        </div>
        <Link
          href="/"
          className="inline-block text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          &larr; Back to the home page
        </Link>
      </div>
    </div>
  );
}
