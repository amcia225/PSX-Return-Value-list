import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { HugePet } from '../types/huge';

interface DeleteConfirmModalProps {
  huge: HugePet | null;
  onClose: () => void;
  onConfirm: (id: number) => Promise<void>;
}

export function DeleteConfirmModal({ huge, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (huge) {
      setError(null);
      setDeleting(false);
    }
  }, [huge]);

  useEffect(() => {
    if (!huge) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [huge, onClose]);

  if (!huge) {
    return null;
  }

  async function handleConfirm() {
    if (!huge) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(huge.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć Huge z bazy danych.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-huge-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#101322] p-6 shadow-[0_24px_64px_-16px_rgba(244,63,94,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/15 text-rose-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="delete-huge-title" className="font-display text-lg font-bold text-white">
                Usunąć Huge?
              </h2>
              <p className="text-xs text-slate-400">Ta operacja trwale usunie wpis z bazy.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno potwierdzenia"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-300 leading-relaxed">
          Czy na pewno chcesz usunąć <span className="font-semibold text-white">{huge.name}</span> z publicznej listy wartości?
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 cursor-pointer"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
          >
            {deleting ? 'Usuwanie...' : 'Usuń trwale'}
          </button>
        </div>
      </div>
    </div>
  );
}
