import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA]">
      {/* Hero section */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left - branding panel */}
        <div className="lg:w-1/2 bg-[#12355B] flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24 py-16 lg:py-0 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

          <div className="relative z-10 max-w-lg">
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={220} height={57} className="brightness-0 invert mb-12" priority />

            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
              Uw boekhouding,<br />
              <span className="text-[#2E6FA7]">helder en overzichtelijk.</span>
            </h1>

            <p className="text-white/70 text-lg leading-relaxed max-w-md mb-10">
              Manage your invoices, view your tax overviews, and stay in control of your bookkeeping &mdash; all in one place.
            </p>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2E6FA7]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/80 text-sm">Create and send invoices</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2E6FA7]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/80 text-sm">VAT returns and tax overviews</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#2E6FA7]/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/80 text-sm">Veilig en betrouwbaar platform</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right - CTA panel */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 sm:px-12 py-16 lg:py-0">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="lg:hidden mb-10 flex justify-center">
              <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={200} height={52} priority />
            </div>

            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#0E2A47] mb-2">Get started</h2>
              <p className="text-[#4F7191]/70 text-base">Log in or create a new account</p>
            </div>

            <div className="space-y-4">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full bg-[#12355B] hover:bg-[#101A3D] text-white font-semibold py-4 px-6 rounded-xl transition-all text-lg shadow-sm hover:shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Inloggen
              </Link>

              <Link
                href="/register"
                className="flex items-center justify-center gap-2 w-full bg-white hover:bg-gray-50 text-[#0E2A47] font-semibold py-4 px-6 rounded-xl border border-gray-200 transition-all text-lg hover:border-gray-300"
              >
                <svg className="w-5 h-5 text-[#4F7191]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Registreren
              </Link>

              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#F5F7FA] px-4 text-sm text-[#4F7191]/50">of</span>
                </div>
              </div>

              <Link
                href="/advisory"
                className="flex items-center justify-center gap-2 w-full bg-[#2E6FA7]/10 hover:bg-[#2E6FA7]/15 text-[#12355B] font-medium py-3.5 px-6 rounded-xl transition-colors border border-[#2E6FA7]/20"
              >
                <svg className="w-5 h-5 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                I'd like an introductory call
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <div className="flex items-center justify-center lg:justify-start gap-6">
                <div className="flex items-center gap-2 text-[#4F7191]/50">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-xs">SSL beveiligd</span>
                </div>
                <div className="flex items-center gap-2 text-[#4F7191]/50">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-xs">GDPR-compliant</span>
                </div>
                <div className="flex items-center gap-2 text-[#4F7191]/50">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                  <span className="text-xs">Cloud-gebaseerd</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
