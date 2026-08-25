"use client";

/**
 * Editor genérico para campos tipo lista (education, experience, projects,
 * languages, social_networks, bullets, etc.): agregar, quitar y reordenar
 * (subir/bajar) elementos. Reordenar por botones en vez de drag-and-drop
 * nativo -- más confiable entre navegadores y accesible por teclado; si
 * después quieres drag-and-drop real lo cambiamos aquí sin tocar el resto
 * del editor.
 */
export function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  newItem,
  addLabel,
  emptyLabel,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, index: number, update: (next: T) => void) => React.ReactNode;
  newItem: () => T;
  addLabel: string;
  emptyLabel?: string;
}) {
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function update(index: number, value: T) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && emptyLabel && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyLabel}</p>
      )}
      {items.map((item, index) => (
        <div
          key={index}
          className="flex gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex-1">{renderItem(item, index, (next) => update(index, next))}</div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-zinc-700"
              title="Mover arriba"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-zinc-700"
              title="Mover abajo"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 dark:border-red-900 dark:text-red-400"
              title="Eliminar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + {addLabel}
      </button>
    </div>
  );
}
