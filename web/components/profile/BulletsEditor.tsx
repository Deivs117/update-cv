"use client";

import { ArrayEditor } from "@/components/profile/ArrayEditor";
import { StringListEditor, TextAreaField } from "@/components/profile/fields";
import { newId, type EditableBullet } from "@/components/profile/types";

/** Editor de la lista de bullets de una experiencia o proyecto. */
export function BulletsEditor({
  bullets,
  onChange,
}: {
  bullets: EditableBullet[];
  onChange: (next: EditableBullet[]) => void;
}) {
  return (
    <ArrayEditor
      items={bullets}
      onChange={onChange}
      addLabel="bullet"
      emptyLabel="Sin bullets todavía."
      newItem={() => ({ id: newId("b"), text_es: "", text_en: "", keywords: [] })}
      renderItem={(bullet, _index, update) => (
        <div className="flex flex-col gap-2">
          <TextAreaField
            label="Texto (ES)"
            value={bullet.text_es}
            onChange={(v) => update({ ...bullet, text_es: v })}
            rows={2}
          />
          <TextAreaField
            label="Texto (EN)"
            value={bullet.text_en}
            onChange={(v) => update({ ...bullet, text_en: v })}
            rows={2}
          />
          <div>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Keywords
            </span>
            <StringListEditor
              items={bullet.keywords}
              onChange={(v) => update({ ...bullet, keywords: v })}
              placeholder="keyword"
            />
          </div>
        </div>
      )}
    />
  );
}
