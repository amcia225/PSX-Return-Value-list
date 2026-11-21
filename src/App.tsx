import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  Check,
  CheckCircle2,
  Database,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminPinModal } from './components/AdminPinModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { HugeCard } from './components/HugeCard';
import { HugeFormModal } from './components/HugeFormModal';
import type {
  AdminStatusResponse,
  HealthResponse,
  HugeFormPayload,
  HugePet,
  SortOption,
} from './types/huge';

export default function App() {
  const [huges, setHuges] = useState<HugePet[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('value-desc');

  // Admin state: token stored strictly in React memory (never localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingHuge, setEditingHuge] = useState<HugePet | null>(null);
  const [deletingHuge, setDeletingHuge] = useState<HugePet | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setFetchError(null);
      const [hugesRes, healthRes] = await Promise.all([
        fetch('/api/huges'),
        fetch('/api/health'),
      ]);

      if (!hugesRes.ok) {
        throw new Error('Nie udało się pobrać listy Huge z serwera.');
      }

      const hugesData = (await hugesRes.json()) as { huges: HugePet[] };
      setHuges(Array.isArray(hugesData.huges) ? hugesData.huges : []);

      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as HealthResponse;
        setDbStatus(healthData.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE');
      } else {
        setDbStatus('OFFLINE');
      }
    } catch (err) {
      setDbStatus('OFFLINE');
      setFetchError(
        err instanceof Error ? err.message : 'Błąd połączenia z bazą danych.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAdminStatus = useCallback(async (token: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/status', { headers });
      if (!res.ok) return;
      const status = (await res.json()) as AdminStatusResponse;
      setNeedsPinSetup(status.needsSetup);
      if (token && !status.authenticated) {
        setAdminToken(null);
      }
    } catch {
      // Ignore silent status check failures
    }
  }, []);

  useEffect(() => {
    void loadData();
    if (new URLSearchParams(window.location.search).get('public') !== '1') {
      void checkAdminStatus(null);
    }
  }, [loadData, checkAdminStatus]);

  useEffect(() => {
    if (!actionFeedback) return;
    const timer = window.setTimeout(() => setActionFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [actionFeedback]);

  async function handleShareList() {
    const publicUrl = new URL(window.location.pathname || '/', window.location.origin);
    if (publicUrl.hostname.startsWith('ais-dev-')) {
      publicUrl.hostname = publicUrl.hostname.replace(/^ais-dev-/, 'ais-pre-');
    }
    publicUrl.searchParams.set('public', '1');
    const shareUrl = publicUrl.toString();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('Clipboard copy failed');
        }
      }
      setCopiedLink(true);
      setActionFeedback({
        type: 'success',
        message: 'Skopiowano publiczny link do listy cen (bez panelu admina)!',
      });
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setActionFeedback({
        type: 'error',
        message: 'Nie udało się automatycznie skopiować linku. Skopiuj adres z paska przeglądarki.',
      });
    }
  }

  async function handleOpenAdmin() {
    await checkAdminStatus(adminToken);
    setPinModalOpen(true);
  }

  async function handleLogoutAdmin() {
    if (adminToken) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch {
        // Proceed with clearing client state even if request fails
      }
    }
    setAdminToken(null);
    setFormModalOpen(false);
    setEditingHuge(null);
    setDeletingHuge(null);
    setActionFeedback({
      type: 'success',
      message: 'Wylogowano z panelu administratora.',
    });
  }

  async function handleSaveHuge(payload: HugeFormPayload, editingId: number | null) {
    if (!adminToken) {
      throw new Error('Brak aktywnej sesji administratora. Zaloguj się ponownie.');
    }

    const url = editingId !== null ? `/api/huges/${editingId}` : '/api/huges';
    const method = editingId !== null ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      huge?: HugePet;
      error?: string;
    };

    if (res.status === 401) {
      setAdminToken(null);
      throw new Error(data.error || 'Sesja administratora wygasła. Zaloguj się ponownie.');
    }

    if (!res.ok || !data.huge) {
      throw new Error(data.error || 'Nie udało się zapisać danych w bazie.');
    }

    await loadData();
    setActionFeedback({
      type: 'success',
      message:
        editingId !== null
          ? `Zaktualizowano "${data.huge.name}".`
          : `Dodano "${data.huge.name}" do bazy danych.`,
    });
  }

  async function handleDeleteHuge(id: number) {
    if (!adminToken) {
      throw new Error('Brak aktywnej sesji administratora. Zaloguj się ponownie.');
    }

    const res = await fetch(`/api/huges/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (res.status === 401) {
      setAdminToken(null);
      throw new Error(data.error || 'Sesja administratora wygasła. Zaloguj się ponownie.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Nie udało się usunąć Huge z bazy danych.');
    }

    await loadData();
    setActionFeedback({
      type: 'success',
      message: 'Usunięto Huge z bazy danych.',
    });
  }

  const filteredAndSortedHuges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? huges.filter((h) => h.name.toLowerCase().includes(q))
      : [...huges];

    filtered.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' });
      }
      if (sortBy === 'value-asc') {
        return a.normalValue - b.normalValue || a.name.localeCompare(b.name, 'pl');
      }
      return b.normalValue - a.normalValue || a.name.localeCompare(b.name, 'pl');
    });

    return filtered;
  }, [huges, searchQuery, sortBy]);

  const isPublicView = useMemo(
    () => new URLSearchParams(window.location.search).get('public') === '1',
    []
  );
  const isAdmin = !isPublicView && adminToken !== null;

  return (
    <div className="min-h-screen flex flex-col bg-[#07080F] text-slate-100">
      {/* Ambient Background Accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(168,85,247,0.22),rgba(56,189,248,0.1)_45%,transparent_75%)]"
      />

      {/* Top Navigation Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080F]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          <a
            href="#top"
            className="font-display text-base sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            PSX RETURN VALUES
          </a>

          <nav
            aria-label="Nawigacja główna"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
          >
            <a
              href="#lista-huge"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Lista Huge
            </a>
            <a
              href="#zasady-wyceny"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Zasady wyceny
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleShareList}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold tracking-wide text-slate-200 transition-colors hover:border-purple-400/40 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-300">Skopiowano!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>Udostępnij listę</span>
                </>
              )}
            </button>

            {!isPublicView &&
              (isAdmin ? (
                <button
                  type="button"
                  onClick={handleLogoutAdmin}
                  className="inline-flex items-center gap-2 rounded-xl border border-pink-400/35 bg-pink-500/15 px-4 py-2 text-xs font-bold tracking-wide text-pink-200 transition-colors hover:bg-pink-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  WYLOGUJ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenAdmin}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-sky-500 px-4 py-2 text-xs font-bold tracking-wide text-white shadow-md shadow-purple-500/25 transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  ADMIN
                </button>
              ))}
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-8 sm:py-10">
        {/* Hero Brand & Live Stats Section */}
        <section className="rounded-2xl border border-white/10 bg-[#101322]/90 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1
                className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                <span className="bg-gradient-to-r from-white via-purple-200 to-sky-300 bg-clip-text text-transparent">
                  PSX RETURN VALUES
                </span>
              </h1>
              <p className="mt-2 text-sm sm:text-base font-medium text-slate-300">
                Huge Value List <span className="mx-1.5 text-purple-400" aria-hidden="true">•</span> Broxi Studio
              </p>
            </div>

            {/* Two Required Stats: HUGE PETS & DATABASE */}
            <div className="grid grid-cols-2 divide-x divide-white/10 rounded-xl border border-white/10 bg-[#0A0C16] shrink-0">
              <div className="px-5 py-3.5 sm:px-7">
                <div className="text-[11px] font-semibold tracking-wider text-slate-400">
                  HUGE PETS
                </div>
                <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-white">
                  {loading ? '—' : huges.length}
                </div>
              </div>

              <div className="px-5 py-3.5 sm:px-7">
                <div className="text-[11px] font-semibold tracking-wider text-slate-400">
                  DATABASE
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-lg sm:text-xl font-bold tracking-wide">
                  {dbStatus === 'ONLINE' ? (
                    <>
                      <Database className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span className="text-emerald-400">ONLINE</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
                      <span className="text-rose-400">OFFLINE</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feedback Toast / Banner */}
        {actionFeedback && (
          <div
            role="status"
            className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
              actionFeedback.type === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{actionFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              aria-label="Zamknij komunikat"
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Admin Toolbar (Visible only after valid PIN authentication) */}
        {isAdmin && (
          <section
            aria-label="Narzędzia administratora"
            className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-purple-500/35 bg-purple-950/20 px-5 py-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Panel administratora aktywny
              </h2>
              <p className="text-xs text-slate-300">
                Możesz dodawać nowe Huge oraz edytować lub usuwać istniejące pozycje. Zmiany zapisują się od razu dla wszystkich odwiedzających.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingHuge(null);
                setFormModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-sky-500 px-5 py-2.5 text-xs font-bold tracking-wide text-white shadow-lg shadow-purple-500/25 transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Dodaj Huge
            </button>
          </section>
        )}

        {/* Search & Sort Controls */}
        <section
          id="lista-huge"
          aria-label="Wyszukiwanie i sortowanie Huge"
          className="mt-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj Huge po nazwie..."
              aria-label="Szukaj Huge po nazwie"
              className="w-full rounded-xl border border-white/10 bg-[#101322] py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-400 transition-colors focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Wyczyść wyszukiwanie"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sort Segmented Buttons */}
          <div
            role="group"
            aria-label="Sortowanie listy"
            className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#101322] p-1"
          >
            <button
              type="button"
              onClick={() => setSortBy('value-desc')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sortBy === 'value-desc'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
              Najwyższa wartość
            </button>

            <button
              type="button"
              onClick={() => setSortBy('value-asc')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sortBy === 'value-asc'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
              Najniższa wartość
            </button>

            <button
              type="button"
              onClick={() => setSortBy('name-asc')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                sortBy === 'name-asc'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ArrowUpAZ className="h-3.5 w-3.5" aria-hidden="true" />
              Alfabetycznie A–Z
            </button>
          </div>
        </section>

        {/* Results Count */}
        {!loading && !fetchError && huges.length > 0 && (
          <div className="mt-4 text-xs text-slate-400">
            Wyświetlono <span className="font-mono font-semibold text-slate-200 tabular-nums">{filteredAndSortedHuges.length}</span> z{' '}
            <span className="font-mono font-semibold text-slate-200 tabular-nums">{huges.length}</span> Huge Pets
          </div>
        )}

        {/* Huge Grid / States */}
        <section className="mt-5" aria-live="polite">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-80 animate-pulse rounded-2xl border border-white/10 bg-[#101322]"
                />
              ))}
            </div>
          ) : fetchError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-[#101322] p-8 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-rose-400" aria-hidden="true" />
              <h2 className="mt-3 font-display text-lg font-bold text-white">
                Błąd połączenia z bazą danych
              </h2>
              <p className="mt-1 text-sm text-slate-400">{fetchError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void loadData();
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/15 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Spróbuj ponownie
              </button>
            </div>
          ) : huges.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#101322] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-400/25 bg-purple-500/10 text-purple-300">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-white">
                Lista Huge jest jeszcze pusta
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
                {isAdmin
                  ? 'Dodaj swojego pierwszego Huge z bezpośrednim linkiem do zdjęcia i wartościami bazowymi.'
                  : 'Lista Huge jest obecnie pusta. Wróć wkrótce, aby sprawdzić aktualne wartości.'}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingHuge(null);
                    setFormModalOpen(true);
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-sky-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/25 transition-opacity hover:opacity-95 cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Dodaj pierwszego Huge
                </button>
              )}
            </div>
          ) : filteredAndSortedHuges.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#101322] p-10 text-center">
              <h2 className="font-display text-lg font-bold text-white">
                Brak wyników dla „{searchQuery.trim()}”
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Spróbuj wpisać inną nazwę Huge lub wyczyść filtr wyszukiwania.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-5 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10 cursor-pointer"
              >
                Wyczyść wyszukiwanie
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredAndSortedHuges.map((huge) => (
                <HugeCard
                  key={huge.id}
                  huge={huge}
                  isAdmin={isAdmin}
                  onEdit={(item) => {
                    setEditingHuge(item);
                    setFormModalOpen(true);
                  }}
                  onDelete={(item) => setDeletingHuge(item)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Value Methodology Section */}
        <section
          id="zasady-wyceny"
          className="mt-12 rounded-2xl border border-white/10 bg-[#101322]/70 p-6"
        >
          <h2 className="font-display text-base font-bold text-white">
            Jak obliczane są wartości w PSX RETURN VALUES?
          </h2>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
            Każdy Huge posiada indywidualną wartość bazową <span className="font-semibold text-slate-100">NORMAL</span> oraz dedykowane mnożniki dla wariantów{' '}
            <span className="font-semibold text-amber-400">GOLDEN</span> i{' '}
            <span className="font-semibold text-fuchsia-300">RAINBOW</span>. Wszystkie dane są przechowywane w trwałej bazie danych i aktualizują się publicznie dla każdego gracza zaraz po zatwierdzeniu przez administratora.
          </p>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#07080F] py-6">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 text-xs text-slate-400">
          <span>PSX RETURN VALUES · Huge Value List</span>
          <span>Broxi Studio · Pet Simulator X Return</span>
        </div>
      </footer>

      {/* Admin Modals (Never rendered in public player share view) */}
      {!isPublicView && (
        <>
          <AdminPinModal
            open={pinModalOpen}
            needsSetup={needsPinSetup}
            onClose={() => setPinModalOpen(false)}
            onAuthenticated={(token) => {
              setAdminToken(token);
              setNeedsPinSetup(false);
              setActionFeedback({
                type: 'success',
                message: 'Zalogowano do panelu administratora.',
              });
            }}
          />

          <HugeFormModal
            open={formModalOpen}
            editingHuge={editingHuge}
            onClose={() => {
              setFormModalOpen(false);
              setEditingHuge(null);
            }}
            onSave={handleSaveHuge}
          />

          <DeleteConfirmModal
            huge={deletingHuge}
            onClose={() => setDeletingHuge(null)}
            onConfirm={handleDeleteHuge}
          />
        </>
      )}
    </div>
  );
}
