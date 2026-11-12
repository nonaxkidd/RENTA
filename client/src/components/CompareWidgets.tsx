export interface CompareItem {
  id: string;
  title: string;
}

interface CompareToggleProps {
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function CompareToggle({ selected, disabled, onToggle }: CompareToggleProps) {
  return (
    <button
      type="button"
      className={selected ? "cmp-toggle selected" : "cmp-toggle"}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? "You can compare up to 2 listings. Remove one first." : undefined}
    >
      <span className="cmp-toggle-box">
        {selected && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="5 12 10 17 19 7" />
          </svg>
        )}
      </span>
      Compare
    </button>
  );
}

interface CompareBarProps {
  items: CompareItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}

export function CompareBar({ items, onRemove, onClear, onCompare }: CompareBarProps) {
  if (items.length === 0) return null;

  const ready = items.length === 2;

  return (
    <div className="cmp-bar" role="region" aria-label="Compare listings">
      <div className="cmp-bar-items">
        {items.map((item) => (
          <span className="cmp-bar-chip" key={item.id}>
            <span className="cmp-bar-chip-text">{item.title}</span>
            <button
              type="button"
              className="cmp-bar-remove"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.title} from comparison`}
            >
              ×
            </button>
          </span>
        ))}
        {!ready && <span className="cmp-bar-hint">Pick one more listing to compare</span>}
      </div>

      <div className="cmp-bar-actions">
        <button type="button" className="cmp-bar-clear" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="cmp-bar-go" onClick={onCompare} disabled={!ready}>
          Compare now
        </button>
      </div>
    </div>
  );
}