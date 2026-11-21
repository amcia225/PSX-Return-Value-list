import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from 'lucide-react';

interface AdminPinModalProps {
  open: boolean;
  needsSetup: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
}

export function AdminPinModal({
  open,
  needsSetup,
  onClose,
  onAuthenticated,
}: AdminPinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirmPin('');
      setError(null);
      setShowPin(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedPin = pin.trim();
    if (trimmedPin.length < 4) {
      setError('PIN musi zawierać co najmniej 4 znaki.');
      return;
    }

    if (needsSetup && trimmedPin !== confirmPin.trim()) {
      setError('Wpisane kody PIN nie są identyczne.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/admin/setup' : '/api/admin/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: trimmedPin }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };

      if (!response.ok || !data.token) {
        setError(data.error || 'Nie udało się zweryfikować kodu PIN.');
        return;
      }

      onAuthenticated(data.token);
      onClose();
    } catch {
      setError('Błąd połączenia z serwerem podczas weryfikacji PIN-u.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pin-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-[#101322] p-6 shadow-[0_24px_64px_-16px_rgba(168,85,247,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/15 text-purple-300">
              {needsSetup ? (
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              ) : (
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 id="admin-pin-modal-title" className="font-display text-lg font-bold text-white">
                {needsSetup ? 'Konfiguracja PIN administratora' : 'Panel administratora'}
              </h2>
              <p className="text-xs text-slate-400">
                {needsSetup
                  ? 'Utwórz własny PIN chroniący edycję listy Huge'
                  : 'Wpisz kod PIN, aby zarządzać listą Huge Pets'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno logowania"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-pin-input" className="block text-xs font-semibold text-slate-300">
              {needsSetup ? 'Nowy kod PIN (min. 4 znaki)' : 'Kod PIN'}
            </label>
            <div className="relative mt-1.5">
              <input
                ref={inputRef}
                id="admin-pin-input"
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                placeholder="Wpisz PIN..."
                className="w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 pr-11 font-mono text-sm text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                aria-label={showPin ? 'Ukryj PIN' : 'Pokaż PIN'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <div>
              <label htmlFor="admin-pin-confirm" className="block text-xs font-semibold text-slate-300">
                Powtórz kod PIN
              </label>
              <input
                id="admin-pin-confirm"
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                autoComplete="new-password"
                placeholder="Powtórz PIN..."
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                PIN jest zapisywany w formie zaszyfrowanego skrótu na serwerze. Możesz go też nadpisać zmienną środowiskową <span className="font-mono text-slate-300">ADMIN_PIN</span> w ustawieniach sekretów.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-sky-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-500/25 transition-opacity hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? 'Weryfikacja...'
                : needsSetup
                  ? 'Zapisz PIN i wejdź'
                  : 'Zaloguj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
