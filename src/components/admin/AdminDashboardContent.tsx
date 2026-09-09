"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string | null;
  kvkNumber: string | null;
  legalForm: string | null;
  phone: string | null;
  emailVerified: boolean;
  isNew: boolean;
  createdAt: string;
  username: string | null;
  vatNumber: string | null;
  vatObligation: string | null;
  iban: string | null;
  bankName: string | null;
  accountHolder: string | null;
}

interface Stats {
  totalUsers: number;
  totalClients: number;
  totalBookkeepers: number;
  totalInvoices: number;
  newClients: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  totalRevenue: number;
  recentUsers: AdminUser[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    client: "bg-blue-100 text-blue-700",
    bookkeeper: "bg-emerald-100 text-emerald-700",
    admin: "bg-purple-100 text-purple-700",
  };
  const labels: Record<string, string> = {
    client: "Customer",
    bookkeeper: "Boekhouder",
    admin: "Admin",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[role] || "bg-gray-100"}`}>
      {labels[role] || role}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${active ? "bg-green-500" : "bg-red-400"}`} />
  );
}

export default function AdminDashboardContent({ tab }: { tab: "overview" | "users" | "settings" | "taxconcepts" }) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "client",
    password: "",
    company: "",
    kvkNumber: "",
    legalForm: "",
    phone: "",
  });
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Settings state
  const [kvkApiKey, setKvkApiKey] = useState("");
  const [kvkContractNr, setKvkContractNr] = useState("");
  const [kvkBaseUrl, setKvkBaseUrl] = useState("https://api.kvk.nl/api");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [kvkConnTesting, setKvkConnTesting] = useState(false);
  const [kvkConnStatus, setKvkConnStatus] = useState<{ connected: boolean; message?: string; error?: string } | null>(null);
  const [aiConnTesting, setAiConnTesting] = useState(false);
  const [aiConnStatus, setAiConnStatus] = useState<{
    connected: boolean;
    message?: string;
    error?: string;
    rateLimits?: {
      requestsPerDayLimit: number | null; requestsPerDayRemaining: number | null;
      tokensPerMinuteLimit: number | null; tokensPerMinuteRemaining: number | null;
      requestsResetIn: string | null; tokensResetIn: string | null;
    } | null;
  } | null>(null);
  const [scanStats, setScanStats] = useState<{
    lastScan: {
      documentId: string; at: string;
      originalWidthPx: number | null; originalHeightPx: number | null; originalBytes: number;
      sentWidthPx: number | null; sentHeightPx: number | null; sentBytes: number;
      // Which progressive-resolution tier produced this scan (see
      // chooseScanResolution in lib/ai.ts) — optional so this still renders
      // fine against an older cached response shape that predates the field.
      quotaTier?: "comfortable" | "low" | "very-low" | "unknown";
      maxSizeUsed?: number; qualityUsed?: number;
    } | null;
  } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  // Masked previews only ("sk-a••••b3c1") — the real secret values are never sent to
  // the browser. The input fields above start empty; leaving them empty on save keeps
  // whatever is already configured, typing a new value replaces it.
  const [kvkApiKeyMasked, setKvkApiKeyMasked] = useState("");
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState("");

  // Tax concepts (task #5 dataset) state
  interface TaxConcept { id: string; key: string; label: string; groundingFact: string; category: string; isActive: boolean; }
  const [taxConcepts, setTaxConcepts] = useState<TaxConcept[]>([]);
  const [taxConceptsLoading, setTaxConceptsLoading] = useState(false);
  const [editingConcept, setEditingConcept] = useState<TaxConcept | null>(null);
  const [showNewConcept, setShowNewConcept] = useState(false);
  const [conceptForm, setConceptForm] = useState({ key: "", label: "", groundingFact: "", category: "vAT" });
  const [conceptSaving, setConceptSaving] = useState(false);
  const [conceptError, setConceptError] = useState("");

  function loadTaxConcepts() {
    setTaxConceptsLoading(true);
    fetch("/api/admin/tax-concepts").then((r) => r.ok ? r.json() : []).then(setTaxConcepts).catch(() => {}).finally(() => setTaxConceptsLoading(false));
  }

  async function createTaxConcept() {
    setConceptError("");
    if (!conceptForm.key.trim() || !conceptForm.label.trim() || !conceptForm.groundingFact.trim()) {
      setConceptError("Key, label and fact are required");
      return;
    }
    setConceptSaving(true);
    try {
      const res = await fetch("/api/admin/tax-concepts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conceptForm),
      });
      const data = await res.json();
      if (res.ok) {
        setTaxConcepts((prev) => [...prev, data]);
        setShowNewConcept(false);
        setConceptForm({ key: "", label: "", groundingFact: "", category: "vAT" });
      } else {
        setConceptError(data.error || "Save failed");
      }
    } catch { setConceptError("Connection error"); }
    finally { setConceptSaving(false); }
  }

  async function saveEditedConcept() {
    if (!editingConcept) return;
    setConceptSaving(true);
    try {
      const res = await fetch(`/api/admin/tax-concepts/${editingConcept.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editingConcept.label, groundingFact: editingConcept.groundingFact, category: editingConcept.category }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTaxConcepts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        setEditingConcept(null);
      }
    } catch { /* */ }
    finally { setConceptSaving(false); }
  }

  async function toggleConceptActive(concept: TaxConcept) {
    const res = await fetch(`/api/admin/tax-concepts/${concept.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !concept.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTaxConcepts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => {
        if (r.status === 401 || r.status === 403) {
          router.push("/login");
          throw new Error("unauthorized");
        }
        return r.json();
      }),
      fetch("/api/admin/users").then((r) => r.json()),
    ])
      .then(([statsData, usersData]) => {
        setStats(statsData);
        setUsers(usersData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load settings
    fetch("/api/admin/settings").then((r) => r.ok ? r.json() : {}).then((data: Record<string, { value?: string; masked?: string }>) => {
      // kvk_api_key / groq_api_key are secrets: the API no longer returns their real
      // value, only a masked preview shown as a placeholder. The fields stay empty
      // until the admin types a new key.
      if (data.kvk_api_key) setKvkApiKeyMasked(data.kvk_api_key.masked || "");
      if (data.kvk_contract_nr) setKvkContractNr(data.kvk_contract_nr.value || "");
      if (data.kvk_api_base_url) setKvkBaseUrl(data.kvk_api_base_url.value || "https://api.kvk.nl/api");
      if (data.groq_api_key) setAiApiKeyMasked(data.groq_api_key.masked || "");
    }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (tab === "taxconcepts" && taxConcepts.length === 0) loadTaxConcepts();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveKvkSettings() {
    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            // Only send secrets the admin actually typed a new value for — an empty
            // field means "keep the currently configured key", not "clear it".
            ...(kvkApiKey ? { kvk_api_key: kvkApiKey } : {}),
            kvk_contract_nr: kvkContractNr,
            kvk_api_base_url: kvkBaseUrl,
            ...(aiApiKey ? { groq_api_key: aiApiKey } : {}),
          },
        }),
      });
      if (res.ok) {
        setSettingsMessage("KVK settings saved");
        if (kvkApiKey) { setKvkApiKeyMasked(kvkApiKey.length > 8 ? kvkApiKey.slice(0, 4) + "••••" + kvkApiKey.slice(-4) : "••••••••"); setKvkApiKey(""); }
        if (aiApiKey) { setAiApiKeyMasked(aiApiKey.length > 8 ? aiApiKey.slice(0, 4) + "••••" + aiApiKey.slice(-4) : "••••••••"); setAiApiKey(""); }
        setKvkConnStatus(null);
        setTimeout(() => setSettingsMessage(""), 4000);
      } else {
        setSettingsMessage("Save failed");
      }
    } catch { setSettingsMessage("Er ging iets mis"); }
    finally { setSettingsSaving(false); }
  }

  async function testKvkConnection() {
    setKvkConnTesting(true);
    setKvkConnStatus(null);
    try {
      const res = await fetch("/api/kvk/test-connection");
      const data = await res.json();
      setKvkConnStatus(data);
    } catch {
      setKvkConnStatus({ connected: false, error: "Could not connect" });
    } finally { setKvkConnTesting(false); }
  }

  async function testAiConnection() {
    setAiConnTesting(true);
    setAiConnStatus(null);
    try {
      const res = await fetch("/api/ai/test-connection");
      const data = await res.json();
      setAiConnStatus(data);
    } catch {
      setAiConnStatus({ connected: false, error: "Could not connect" });
    } finally { setAiConnTesting(false); }

    // Best-effort — this diagnostic is purely informational, so a failure here
    // shouldn't affect the connection-test result above.
    try {
      const scanRes = await fetch("/api/ai/scan-purchase-document/diagnostics");
      if (scanRes.ok) setScanStats(await scanRes.json());
    } catch { /* ignore — informational panel only */ }
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.company && u.company.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function toggleVerification(user: AdminUser) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailVerified: !user.emailVerified }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, emailVerified: !u.emailVerified } : u))
        );
        if (selectedUser?.id === user.id) {
          setSelectedUser({ ...selectedUser, emailVerified: !selectedUser.emailVerified });
        }
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleNewStatus(user: AdminUser) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isNew: !user.isNew }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isNew: !u.isNew } : u))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setSelectedUser(null);
        // Refresh stats
        const statsRes = await fetch("/api/admin/stats");
        if (statsRes.ok) setStats(await statsRes.json());
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateLoading(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Er ging iets mis");
        return;
      }
      // Refresh users and stats
      const [usersRes, statsRes] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/stats").then((r) => r.json()),
      ]);
      setUsers(usersRes);
      setStats(statsRes);
      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", role: "client", password: "", company: "", kvkNumber: "", legalForm: "", phone: "" });
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreateLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === "overview" && stats && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Totaal gebruikers</p>
                </div>
                <p className="text-3xl font-bold">{stats.totalUsers}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Customers</p>
                </div>
                <p className="text-3xl font-bold text-blue-600">{stats.totalClients}</p>
                {stats.newClients > 0 && (
                  <p className="text-xs text-orange-600 mt-1">{stats.newClients} new</p>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Facturen</p>
                </div>
                <p className="text-3xl font-bold text-green-600">{stats.totalInvoices}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Total revenue</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.totalRevenue)}</p>
              </div>
            </div>

            {/* Verification Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
                <h2 className="text-lg font-semibold mb-4">Verification status</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot active={true} />
                      <span className="text-sm text-gray-600">Geverifieerd</span>
                    </div>
                    <span className="font-semibold text-green-600">{stats.verifiedUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot active={false} />
                      <span className="text-sm text-gray-600">Not verified</span>
                    </div>
                    <span className="font-semibold text-red-600">{stats.unverifiedUsers}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all"
                      style={{ width: `${stats.totalUsers > 0 ? (stats.verifiedUsers / stats.totalUsers) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
                <h2 className="text-lg font-semibold mb-4">Gebruikers per rol</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RoleBadge role="client" />
                    </div>
                    <span className="font-semibold">{stats.totalClients}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RoleBadge role="bookkeeper" />
                    </div>
                    <span className="font-semibold">{stats.totalBookkeepers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RoleBadge role="admin" />
                    </div>
                    <span className="font-semibold">
                      {stats.totalUsers - stats.totalClients - stats.totalBookkeepers}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Users */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)]">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Laatste registraties</h2>
                <Link
                  href="/admin/users"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  View all users
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {stats.recentUsers.map((u) => (
                  <div key={u.id} className="p-5 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={u.role} />
                      <StatusDot active={u.emailVerified} />
                      <span className="text-sm text-gray-400">{formatDate(u.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "users" && (
          <div className="flex gap-6">
            {/* Users List */}
            <div className={`${selectedUser ? "w-1/2" : "w-full"} transition-all`}>
              {/* Search & Filter */}
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Search by name, email or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-[200px] px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value="all">Alle rollen</option>
                  <option value="client">Customers</option>
                  <option value="bookkeeper">Boekhouders</option>
                  <option value="admin">Admins</option>
                </select>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  + New user
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Rol</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedUser?.id === u.id ? "bg-purple-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{u.name}</p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusDot active={u.emailVerified} />
                            <span className="text-xs text-gray-500">
                              {u.emailVerified ? "Geverifieerd" : "Not verified"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-gray-400 mt-3">{filteredUsers.length} user(s)</p>
            </div>

            {/* User Detail Panel */}
            {selectedUser && (
              <div className="w-1/2">
                <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6 sticky top-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-lg font-bold text-purple-600">
                        {selectedUser.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{selectedUser.name}</h3>
                        <p className="text-sm text-gray-500">{selectedUser.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">Rol</p>
                        <RoleBadge role={selectedUser.role} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">E-mail verificatie</p>
                        <div className="flex items-center gap-2">
                          <StatusDot active={selectedUser.emailVerified} />
                          <span className="text-sm">
                            {selectedUser.emailVerified ? "Geverifieerd" : "Not verified"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedUser.company && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">Company</p>
                        <p className="text-sm font-medium">{selectedUser.company}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {selectedUser.kvkNumber && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">KVK nummer</p>
                          <p className="text-sm font-mono">{selectedUser.kvkNumber}</p>
                        </div>
                      )}
                      {selectedUser.legalForm && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Rechtsvorm</p>
                          <p className="text-sm capitalize">{selectedUser.legalForm}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {selectedUser.vatNumber && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">VAT nummer</p>
                          <p className="text-sm font-mono">{selectedUser.vatNumber}</p>
                        </div>
                      )}
                      {selectedUser.phone && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Phone</p>
                          <p className="text-sm">{selectedUser.phone}</p>
                        </div>
                      )}
                    </div>

                    {selectedUser.iban && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">IBAN</p>
                        <p className="text-sm font-mono">{selectedUser.iban}</p>
                        {selectedUser.bankName && (
                          <p className="text-xs text-gray-500">{selectedUser.bankName} - {selectedUser.accountHolder}</p>
                        )}
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Geregistreerd op</p>
                      <p className="text-sm">{formatDate(selectedUser.createdAt)}</p>
                    </div>

                    {selectedUser.isNew && (
                      <div className="bg-orange-50 text-orange-700 rounded-lg px-3 py-2 text-sm">
                        New customer - not yet reviewed
                      </div>
                    )}

                    {/* Actions */}
                    <div className="border-t border-gray-100 pt-4 space-y-2">
                      <button
                        onClick={() => toggleVerification(selectedUser)}
                        disabled={actionLoading === selectedUser.id}
                        className={`w-full text-sm font-medium py-2.5 rounded-lg transition-colors ${
                          selectedUser.emailVerified
                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-green-50 text-green-700 hover:bg-green-100"
                        } disabled:opacity-50`}
                      >
                        {selectedUser.emailVerified ? "E-mail verificatie intrekken" : "Manually verify email"}
                      </button>

                      {selectedUser.isNew && (
                        <button
                          onClick={() => toggleNewStatus(selectedUser)}
                          disabled={actionLoading === selectedUser.id}
                          className="w-full text-sm font-medium py-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                          Markeren als beoordeeld
                        </button>
                      )}

                      <button
                        onClick={() => deleteUser(selectedUser.id)}
                        disabled={actionLoading === selectedUser.id}
                        className="w-full text-sm font-medium py-2.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        User delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* SETTINGS TAB */}
        {tab === "settings" && (
          <div className="max-w-2xl space-y-6">
            {/* KVK API Settings */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
              <div className="flex items-center gap-3 mb-1">
                <svg className="w-6 h-6 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h2 className="text-lg font-semibold">KVK API connection</h2>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Configure the connection with the KVK trade register. This is used to look up and import company details in customer management.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contractnummer</label>
                  <input type="text" value={kvkContractNr} onChange={(e) => setKvkContractNr(e.target.value)}
                    placeholder="Your KVK contract number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 focus:border-[#2E6FA7] outline-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API-sleutel</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={kvkApiKey}
                      onChange={(e) => setKvkApiKey(e.target.value)}
                      placeholder={kvkApiKeyMasked ? `Current key: ${kvkApiKeyMasked} (leave blank to keep)` : "Enter your KVK API key"}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 focus:border-[#2E6FA7] outline-none pr-20 font-mono"
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                      {showApiKey ? "Verbergen" : "Tonen"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">The API key is stored securely in the database and is not visible in the frontend.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL</label>
                  <select value={kvkBaseUrl} onChange={(e) => setKvkBaseUrl(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 focus:border-[#2E6FA7] outline-none">
                    <option value="https://api.kvk.nl/api">Production (api.kvk.nl/api)</option>
                    <option value="https://api.kvk.nl/test/api">Test (api.kvk.nl/test/api)</option>
                  </select>
                </div>

                {settingsMessage && (
                  <div className={`rounded-lg px-4 py-3 text-sm ${settingsMessage.includes("saved") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {settingsMessage}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button onClick={saveKvkSettings} disabled={settingsSaving || !kvkApiKey}
                    className="px-5 py-2.5 bg-[#12355B] text-white rounded-lg text-sm font-medium hover:bg-[#101A3D] disabled:opacity-50 transition-colors">
                    {settingsSaving ? "Save..." : "Save settings"}
                  </button>
                  <button onClick={testKvkConnection} disabled={kvkConnTesting || !kvkApiKey}
                    className="px-5 py-2.5 border border-[#2E6FA7]/30 text-[#12355B] rounded-lg text-sm font-medium hover:bg-[#EAF3FA] disabled:opacity-50 transition-colors">
                    {kvkConnTesting ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Testen...
                      </span>
                    ) : "Test connection"}
                  </button>
                </div>

                {kvkConnStatus && (
                  <div className={`flex items-center gap-2 p-4 rounded-lg text-sm ${kvkConnStatus.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {kvkConnStatus.connected ? (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    ) : (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                    <span>{kvkConnStatus.message || kvkConnStatus.error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info card */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">About the KVK API</h3>
              <ul className="text-sm text-gray-500 space-y-1.5">
                <li>• You can request the API key and contract number via <span className="font-medium text-gray-700">developers.kvk.nl</span></li>
                <li>• After saving, the KVK integration is immediately available when creating and editing customers</li>
                <li>• Use the <span className="font-medium text-gray-700">Test</span> environment to test the connection before switching to production</li>
                <li>• The API key is veilig saved and nooit in the browser getoond</li>
              </ul>
            </div>
            {/* AI API Settings */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
              <div className="flex items-center gap-3 mb-1">
                <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <h2 className="text-lg font-semibold">AI-assistent</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">This key powers every AI feature in the app: draft replies &amp; conversation summaries (Messages), purchase document scanning &amp; ledger category suggestions (Purchases), financial insights (AI insights), tax concept explanations (client portal), and the voice invoice assistant.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Groq API key</label>
                <div className="relative">
                  <input type={showAiKey ? "text" : "password"} value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={aiApiKeyMasked ? `Current key: ${aiApiKeyMasked} (leave blank to keep)` : "sk-..."}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none pr-20 font-mono" />
                  <button type="button" onClick={() => setShowAiKey(!showAiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                    {showAiKey ? "Verbergen" : "Tonen"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Get an API key via <span className="font-medium text-gray-600">console.groq.com</span></p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <button onClick={testAiConnection} disabled={aiConnTesting || (!aiApiKey && !aiApiKeyMasked)}
                  className="px-5 py-2.5 border border-[#2E6FA7]/30 text-[#12355B] rounded-lg text-sm font-medium hover:bg-[#EAF3FA] disabled:opacity-50 transition-colors">
                  {aiConnTesting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Testen...
                    </span>
                  ) : "Test connection"}
                </button>
              </div>
              {aiApiKey && (
                <p className="text-xs text-amber-600 mt-2">You&apos;ve typed a new key — save it first, otherwise this tests the currently saved key.</p>
              )}

              {aiConnStatus && (
                <div className={`flex items-center gap-2 p-4 rounded-lg text-sm mt-3 ${aiConnStatus.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {aiConnStatus.connected ? (
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  ) : (
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                  <span>{aiConnStatus.message || aiConnStatus.error}</span>
                </div>
              )}

              {/* Groq's own quota for this key, read straight from their response
                  headers — shows whether "too many AI requests" errors are our own
                  per-user throttle or the real Groq account limit. Per Groq's docs
                  (console.groq.com/docs/rate-limits), the requests figure below is
                  always a DAILY quota (RPM isn't exposed via headers at all) while
                  the tokens figure is genuinely per-minute — and for the two models
                  this app calls, Free tier is exactly 8,000 tokens/min, which the
                  vision-based document scan can burn through in a couple of calls. */}
              {aiConnStatus?.rateLimits && (
                <div className="mt-3 p-4 rounded-lg text-sm bg-gray-50 border border-gray-100">
                  <p className="font-medium text-gray-700 mb-2">Current Groq quota for this key</p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div>
                      <span className="block text-gray-400">Requests / day</span>
                      <span className="font-mono text-gray-800">
                        {aiConnStatus.rateLimits.requestsPerDayRemaining ?? "—"} / {aiConnStatus.rateLimits.requestsPerDayLimit ?? "—"} left
                      </span>
                      {aiConnStatus.rateLimits.requestsResetIn && (
                        <span className="block text-gray-400">resets in {aiConnStatus.rateLimits.requestsResetIn}</span>
                      )}
                    </div>
                    <div>
                      <span className="block text-gray-400">Tokens / min</span>
                      <span className="font-mono text-gray-800">
                        {aiConnStatus.rateLimits.tokensPerMinuteRemaining ?? "—"} / {aiConnStatus.rateLimits.tokensPerMinuteLimit ?? "—"} left
                      </span>
                      {aiConnStatus.rateLimits.tokensResetIn && (
                        <span className="block text-gray-400">resets in {aiConnStatus.rateLimits.tokensResetIn}</span>
                      )}
                    </div>
                  </div>
                  {aiConnStatus.rateLimits.tokensPerMinuteLimit !== null && aiConnStatus.rateLimits.tokensPerMinuteLimit <= 10_000 && (
                    <p className="text-xs text-amber-600 mt-3">
                      This is Groq&apos;s Free tier (8,000 tokens/min on this model) — the document scanner alone can use most of that in one or two calls. Upgrading to the Developer tier (console.groq.com/settings/billing/plans) removes this ceiling once upgrades reopen there.
                    </p>
                  )}
                </div>
              )}

              {/* Effect of MAX_SCAN_IMAGE_SIZE (lib/ai.ts) on the invoice/receipt scanner:
                  before/after resolution and file size for the most recent scan. In-memory
                  only on the server, so this is empty until someone scans a document since
                  the last deploy/restart. */}
              {scanStats?.lastScan && (
                <div className="mt-3 p-4 rounded-lg text-sm bg-gray-50 border border-gray-100">
                  <p className="font-medium text-gray-700 mb-2">Last invoice scan — image sent to Groq</p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div>
                      <span className="block text-gray-400">Original</span>
                      <span className="font-mono text-gray-800">
                        {scanStats.lastScan.originalWidthPx ?? "?"}×{scanStats.lastScan.originalHeightPx ?? "?"}px, {Math.round(scanStats.lastScan.originalBytes / 1024)} KB
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-400">Sent to Groq</span>
                      <span className="font-mono text-gray-800">
                        {scanStats.lastScan.sentWidthPx ?? "?"}×{scanStats.lastScan.sentHeightPx ?? "?"}px, {Math.round(scanStats.lastScan.sentBytes / 1024)} KB
                      </span>
                    </div>
                  </div>
                  {scanStats.lastScan.quotaTier && (
                    <span className="block text-gray-400 text-xs mt-2">
                      resolution tier: <span className="font-mono text-gray-700">{scanStats.lastScan.quotaTier}</span>
                      {" "}({scanStats.lastScan.maxSizeUsed}px / q{scanStats.lastScan.qualityUsed})
                    </span>
                  )}
                  <span className="block text-gray-400 text-xs mt-2">document {scanStats.lastScan.documentId} — scanned {new Date(scanStats.lastScan.at).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAX CONCEPTS TAB — the grounding dataset behind /api/ai/explain-tax-concept.
            Editing here changes what the AI is allowed to explain to clients — nothing
            outside these rows can ever reach the AI for that feature. */}
        {tab === "taxconcepts" && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h2 className="text-lg font-semibold">Fiscale begrippen (AI-uitleg)</h2>
                </div>
                <button onClick={() => setShowNewConcept(true)}
                  className="px-3 py-1.5 bg-[#12355B] text-white rounded-lg text-sm font-medium hover:bg-[#101A3D]">
                  + New concept
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                These are the only facts the AI is allowed to use for "What does this mean?" on the customer tax page. The AI only rephrases what is stated here in plain language — it never invents anything that isn't stated here. Set a concept to inactive to exclude it (without deleting it).
              </p>

              {showNewConcept && (
                <div className="border border-[#2E6FA7]/30 bg-[#EAF3FA] rounded-xl p-4 mb-4 space-y-3">
                  {conceptError && <p className="text-red-700 text-xs">{conceptError}</p>}
                  <input type="text" placeholder="Sleutel (bv. kor_regeling)" value={conceptForm.key}
                    onChange={(e) => setConceptForm((f) => ({ ...f, key: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <input type="text" placeholder="Label (bv. Kleineondernemersregeling)" value={conceptForm.label}
                    onChange={(e) => setConceptForm((f) => ({ ...f, label: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <textarea placeholder="The fact the AI is allowed to rephrase — keep it general, no amounts/dates that can change" value={conceptForm.groundingFact} rows={3}
                    onChange={(e) => setConceptForm((f) => ({ ...f, groundingFact: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowNewConcept(false); setConceptError(""); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                    <button onClick={createTaxConcept} disabled={conceptSaving}
                      className="px-3 py-1.5 bg-[#12355B] text-white rounded-lg text-sm font-medium hover:bg-[#101A3D] disabled:opacity-50">
                      {conceptSaving ? "Save..." : "Create"}
                    </button>
                  </div>
                </div>
              )}

              {taxConceptsLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : taxConcepts.length === 0 ? (
                <p className="text-sm text-gray-400">No concepts created yet.</p>
              ) : (
                <div className="space-y-3">
                  {taxConcepts.map((c) => (
                    <div key={c.id} className={`border rounded-xl p-4 ${c.isActive ? "border-gray-100" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                      {editingConcept?.id === c.id ? (
                        <div className="space-y-2">
                          <input type="text" value={editingConcept.label}
                            onChange={(e) => setEditingConcept((f) => f && { ...f, label: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium" />
                          <textarea value={editingConcept.groundingFact} rows={3}
                            onChange={(e) => setEditingConcept((f) => f && { ...f, groundingFact: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingConcept(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            <button onClick={saveEditedConcept} disabled={conceptSaving}
                              className="px-3 py-1.5 bg-[#12355B] text-white rounded-lg text-sm font-medium hover:bg-[#101A3D] disabled:opacity-50">
                              {conceptSaving ? "Save..." : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">{c.key}</span>
                              {!c.isActive && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">Inactive</span>}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{c.groundingFact}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <button onClick={() => setEditingConcept(c)} className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">Edit</button>
                            <button onClick={() => toggleConceptActive(c)} className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">
                              {c.isActive ? "Deactiveren" : "Activeren"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Create new user</h2>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">{createError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                >
                  <option value="client">Customer</option>
                  <option value="bookkeeper">Boekhouder</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  placeholder="Full name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                  placeholder="name@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">This will also be the username</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                  placeholder="Min. 8 tekens, 1 hoofdletter, 1 cijfer"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                />
              </div>

              {createForm.role === "client" && (
                <>
                  <hr className="border-gray-100" />
                  <p className="text-xs text-gray-500 uppercase font-medium">Company details (optional)</p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
                    <input
                      type="text"
                      value={createForm.company}
                      onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })}
                      placeholder="Bedrijfsnaam"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">KVK nummer</label>
                      <input
                        type="text"
                        value={createForm.kvkNumber}
                        onChange={(e) => setCreateForm({ ...createForm, kvkNumber: e.target.value })}
                        placeholder="12345678"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rechtsvorm</label>
                      <select
                        value={createForm.legalForm}
                        onChange={(e) => setCreateForm({ ...createForm, legalForm: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                      >
                        <option value="">Select...</option>
                        <option value="eenmanszaak">Eenmanszaak</option>
                        <option value="vof">VOF</option>
                        <option value="bv">BV</option>
                        <option value="other">Anders</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefoonnummer</label>
                    <input
                      type="tel"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="0612345678"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
