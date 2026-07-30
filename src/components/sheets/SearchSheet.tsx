import { useEffect, useRef, useState } from "react";
import { Search, SearchX, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { SelectRow } from "@/components/flows/flow-parts";
import { CATEGORIES, SERVICES, type Service } from "@/data/services";
import { useFlows } from "@/store/flows";

/** Command palette — opened from the top-bar search (or the "/" key).
 *  Live-filters the service catalog; picking a result launches its flow. */

const MAX_RESULTS = 8;

function categoryShort(service: Service): string {
  return CATEGORIES.find((c) => c.id === service.category)?.short ?? "";
}

export default function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openService } = useFlows();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open AND close, then steal focus from the modal panel — this
  // effect runs after Modal's own focus effect, so the field wins.
  useEffect(() => {
    setQuery("");
    if (open) inputRef.current?.focus();
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = (
    q
      ? SERVICES.filter(
          (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
        )
      : SERVICES
  ).slice(0, MAX_RESULTS);

  const pick = (service: Service) => {
    onClose();
    openService(service.id);
  };

  return (
    <Modal open={open} onClose={onClose} label="Search services">
      {/* Sticky search field header */}
      <div className="onyx-flowhead sticky top-0 z-10 border-b border-white/[0.06] px-4 py-3.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <label htmlFor="yiego-search-input" className="sr-only">
            Search services
          </label>
          <div className="onyx-search flex min-w-0 flex-1 items-center gap-2.5">
            <Search size={17} className="shrink-0 text-faint-foreground" />
            <input
              ref={inputRef}
              id="yiego-search-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-ink-ghost"
              placeholder="Search services, pay a bill…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results.length > 0) pick(results[0]);
              }}
            />
            <kbd className="onyx-kbd hidden sm:block">esc</kbd>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="onyx-iconbtn shrink-0 rounded-xl"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[15px] border border-white/[0.07] bg-white/[0.03] text-faint-foreground">
            <SearchX size={20} />
          </span>
          <p className="text-[14px] font-semibold text-foreground">No matches for “{query.trim()}”</p>
          <p className="max-w-[32ch] text-[12.5px] text-faint-foreground">
            Try another name — airtime, data, electricity, gift cards…
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 px-4 pb-6 pt-4">
          {results.map((s) => (
            <SelectRow
              key={s.id}
              onClick={() => pick(s)}
              leading={
                <span className="onyx-tx-icon is-out shrink-0">
                  <s.icon size={17} />
                </span>
              }
              title={s.name}
              subtitle={s.description}
              trailing={
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-faint-foreground">
                  {categoryShort(s)}
                </span>
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
