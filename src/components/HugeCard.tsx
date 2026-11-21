import { useState, useEffect } from 'react';
import { Pencil, Trash2, ImageOff } from 'lucide-react';
import type { HugePet } from '../types/huge';
import { computeVariantValues, formatCompactValue, isSafeHttpUrl } from '../utils/valueFormat';

interface HugeCardProps {
  huge: HugePet;
  isAdmin: boolean;
  onEdit: (huge: HugePet) => void;
  onDelete: (huge: HugePet) => void;
}

export function HugeCard({ huge, isAdmin, onEdit, onDelete }: HugeCardProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [huge.imageUrl]);

  const hasValidImage = Boolean(huge.imageUrl.trim()) && isSafeHttpUrl(huge.imageUrl) && !imgError;
  const values = computeVariantValues(
    huge.normalValue,
    huge.goldenMultiplier,
    huge.rainbowMultiplier
  );

  return (
    <article className="group flex flex-col rounded-2xl bg-[#101322] border border-white/10 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-400/45 hover:shadow-[0_14px_36px_-12px_rgba(168,85,247,0.35)]">
      {/* Image Stage */}
      <div className="relative h-48 w-full bg-[#0A0C16] flex items-center justify-center overflow-hidden p-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(168,85,247,0.16),rgba(56,189,248,0.06)_48%,transparent_75%)] opacity-80 transition-opacity duration-200 group-hover:opacity-100"
        />
        {hasValidImage ? (
          <img
            src={huge.imageUrl}
            alt={huge.name}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
            className="relative z-10 max-h-full max-w-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="relative z-10 flex flex-col items-center justify-center gap-2 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-[#14182B]">
              <ImageOff className="h-6 w-6 text-purple-400/70" aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-slate-400">Brak zdjęcia</span>
          </div>
        )}
      </div>

      {/* Title & Multipliers */}
      <div className="px-4 pt-3.5 pb-3 border-t border-white/5">
        <h3 className="font-display text-lg font-bold tracking-tight text-white truncate" title={huge.name}>
          {huge.name}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
          Golden ×{huge.goldenMultiplier}
          <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
          Rainbow ×{huge.rainbowMultiplier}
        </p>
      </div>

      {/* Three Value Fields */}
      <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-[#0C0F1C] mt-auto">
        <div className="px-3 py-3 text-center">
          <div className="text-[11px] font-semibold tracking-wider text-slate-300">NORMAL</div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold tabular-nums text-slate-50 truncate">
            {formatCompactValue(values.normal)}
          </div>
        </div>

        <div className="px-3 py-3 text-center">
          <div className="text-[11px] font-semibold tracking-wider text-amber-300/90">GOLDEN</div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold tabular-nums text-amber-400 truncate">
            {formatCompactValue(values.golden)}
          </div>
        </div>

        <div className="px-3 py-3 text-center">
          <div className="text-[11px] font-semibold tracking-wider text-fuchsia-300/90">RAINBOW</div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold tabular-nums bg-gradient-to-r from-fuchsia-400 via-purple-300 to-sky-400 bg-clip-text text-transparent truncate">
            {formatCompactValue(values.rainbow)}
          </div>
        </div>
      </div>

      {/* Admin Controls (Only rendered when authenticated) */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-[#0A0C16] px-3 py-2.5">
          <button
            type="button"
            onClick={() => onEdit(huge)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edytuj
          </button>
          <button
            type="button"
            onClick={() => onDelete(huge)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Usuń
          </button>
        </div>
      )}
    </article>
  );
}
