import { useEffect, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import type { HugeFormPayload, HugePet } from '../types/huge';
import {
  computeVariantValues,
  formatCompactValue,
  isSafeHttpUrl,
  parseValueInput,
} from '../utils/valueFormat';

interface HugeFormModalProps {
  open: boolean;
  editingHuge: HugePet | null;
  onClose: () => void;
  onSave: (payload: HugeFormPayload, editingId: number | null) => Promise<void>;
}

export function HugeFormModal({ open, editingHuge, onClose, onSave }: HugeFormModalProps) {
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [normalInput, setNormalInput] = useState('');
  const [goldenMultInput, setGoldenMultInput] = useState('1.5');
  const [rainbowMultInput, setRainbowMultInput] = useState('3');
  const [previewImgError, setPreviewImgError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingHuge) {
      setName(editingHuge.name);
      setImageUrl(editingHuge.imageUrl);
      setNormalInput(formatCompactValue(editingHuge.normalValue));
      setGoldenMultInput(String(editingHuge.goldenMultiplier));
      setRainbowMultInput(String(editingHuge.rainbowMultiplier));
    } else {
      setName('');
      setImageUrl('');
      setNormalInput('');
      setGoldenMultInput('1.5');
      setRainbowMultInput('3');
    }
    setPreviewImgError(false);
    setError(null);
  }, [open, editingHuge]);

  useEffect(() => {
    setPreviewImgError(false);
  }, [imageUrl]);

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

  const parsedNormal = parseValueInput(normalInput);
  const parsedGoldenMult = Number(goldenMultInput.replace(',', '.'));
  const parsedRainbowMult = Number(rainbowMultInput.replace(',', '.'));

  const validGolden = Number.isFinite(parsedGoldenMult) && parsedGoldenMult > 0;
  const validRainbow = Number.isFinite(parsedRainbowMult) && parsedRainbowMult > 0;

  const previewValues =
    parsedNormal && validGolden && validRainbow
      ? computeVariantValues(parsedNormal, parsedGoldenMult, parsedRainbowMult)
      : null;

  const showImagePreview =
    Boolean(imageUrl.trim()) && isSafeHttpUrl(imageUrl) && !previewImgError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Podaj nazwę Huge (HUGE NAME).');
      return;
    }

    const trimmedUrl = imageUrl.trim();
    if (!isSafeHttpUrl(trimmedUrl)) {
      setError('Link do zdjęcia musi być poprawnym adresem http:// lub https://.');
      return;
    }

    if (parsedNormal === null || parsedNormal <= 0) {
      setError('Wpisz poprawną wartość NORMAL VALUE większą od zera (np. 100M, 3.5B, 1500).');
      return;
    }

    if (!validGolden || parsedGoldenMult > 10000) {
      setError('Mnożnik GOLDEN MULTIPLIER musi być liczbą większą od 0 (maks. 10000).');
      return;
    }

    if (!validRainbow || parsedRainbowMult > 10000) {
      setError('Mnożnik RAINBOW MULTIPLIER musi być liczbą większą od 0 (maks. 10000).');
      return;
    }

    setSaving(true);
    try {
      await onSave(
        {
          name: trimmedName,
          imageUrl: trimmedUrl,
          normalValue: parsedNormal,
          goldenMultiplier: parsedGoldenMult,
          rainbowMultiplier: parsedRainbowMult,
        },
        editingHuge ? editingHuge.id : null
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian w bazie danych.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="huge-form-modal-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-purple-500/30 bg-[#101322] p-6 shadow-[0_24px_64px_-16px_rgba(168,85,247,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="huge-form-modal-title" className="font-display text-xl font-bold text-white">
              {editingHuge ? `Edytuj: ${editingHuge.name}` : 'Dodaj nowego Huge'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Wartości Golden i Rainbow zostaną automatycznie obliczone z podanych mnożników.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij formularz"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* HUGE NAME */}
          <div>
            <label htmlFor="huge-name" className="block text-xs font-semibold tracking-wide text-slate-300">
              HUGE NAME
            </label>
            <input
              id="huge-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Huge Hell Rock"
              maxLength={120}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>

          {/* HUGE IMAGE URL */}
          <div>
            <label htmlFor="huge-image-url" className="block text-xs font-semibold tracking-wide text-slate-300">
              HUGE IMAGE URL
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="huge-image-url"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#090B14]">
                {showImagePreview ? (
                  <img
                    src={imageUrl.trim()}
                    alt="Podgląd"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewImgError(true)}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <ImageOff className="h-4 w-4 text-slate-500" aria-hidden="true" />
                )}
              </div>
            </div>
          </div>

          {/* NORMAL VALUE */}
          <div>
            <label htmlFor="huge-normal-value" className="block text-xs font-semibold tracking-wide text-slate-300">
              NORMAL VALUE
            </label>
            <input
              id="huge-normal-value"
              type="text"
              value={normalInput}
              onChange={(e) => setNormalInput(e.target.value)}
              placeholder="np. 100M, 3.5B, 1.2T lub 100000000"
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Obsługiwane formaty: liczby (np. <span className="font-mono text-slate-300">1500</span>) oraz skróty <span className="font-mono text-slate-300">K, M, B, T, Qa, Qi</span>.
            </p>
          </div>

          {/* MULTIPLIERS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="huge-golden-mult" className="block text-xs font-semibold tracking-wide text-amber-300">
                GOLDEN MULTIPLIER
              </label>
              <input
                id="huge-golden-mult"
                type="number"
                step="any"
                min="0.01"
                value={goldenMultInput}
                onChange={(e) => setGoldenMultInput(e.target.value)}
                placeholder="1.5"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>

            <div>
              <label htmlFor="huge-rainbow-mult" className="block text-xs font-semibold tracking-wide text-fuchsia-300">
                RAINBOW MULTIPLIER
              </label>
              <input
                id="huge-rainbow-mult"
                type="number"
                step="any"
                min="0.01"
                value={rainbowMultInput}
                onChange={(e) => setRainbowMultInput(e.target.value)}
                placeholder="3"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090B14] px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-500 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
              />
            </div>
          </div>

          {/* Live Calculated Preview */}
          <div className="rounded-xl border border-white/10 bg-[#090B14] overflow-hidden">
            <div className="border-b border-white/10 px-3.5 py-2 text-[11px] font-semibold tracking-wider text-slate-400">
              PODGLĄD OBLICZONYCH WARTOŚCI
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
              <div className="px-3 py-2.5">
                <div className="text-[11px] font-semibold text-slate-400">NORMAL</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-100">
                  {previewValues ? formatCompactValue(previewValues.normal) : '—'}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[11px] font-semibold text-amber-300/80">GOLDEN</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-amber-400">
                  {previewValues ? formatCompactValue(previewValues.golden) : '—'}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[11px] font-semibold text-fuchsia-300/80">RAINBOW</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums bg-gradient-to-r from-fuchsia-400 via-purple-300 to-sky-400 bg-clip-text text-transparent">
                  {previewValues ? formatCompactValue(previewValues.rainbow) : '—'}
                </div>
              </div>
            </div>
          </div>

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
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-sky-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-500/25 transition-opacity hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Zapisywanie...' : editingHuge ? 'Zapisz zmiany' : 'Dodaj Huge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
