"use client";

import { ArrayEditor } from "@/components/profile/ArrayEditor";
import { BulletsEditor } from "@/components/profile/BulletsEditor";
import { Field, SectionCard, StringListEditor, TextAreaField } from "@/components/profile/fields";
import { newId, type EditableProfile } from "@/components/profile/types";

export function ProfileForm({
  profile,
  onChange,
}: {
  profile: EditableProfile;
  onChange: (next: EditableProfile) => void;
}) {
  function set<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Datos personales">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre completo *"
            value={profile.personal.full_name}
            onChange={(v) => set("personal", { ...profile.personal, full_name: v })}
          />
          <Field
            label="Titular / headline (ES)"
            value={profile.personal.headline_es}
            onChange={(v) => set("personal", { ...profile.personal, headline_es: v })}
          />
          <Field
            label="Titular / headline (EN)"
            value={profile.personal.headline_en}
            onChange={(v) => set("personal", { ...profile.personal, headline_en: v })}
          />
          <Field
            label="Email *"
            type="email"
            value={profile.personal.email}
            onChange={(v) => set("personal", { ...profile.personal, email: v })}
          />
          <Field
            label="Teléfono"
            value={profile.personal.phone}
            onChange={(v) => set("personal", { ...profile.personal, phone: v })}
          />
          <Field
            label="Ubicación"
            value={profile.personal.location}
            onChange={(v) => set("personal", { ...profile.personal, location: v })}
          />
          <Field
            label="Edad"
            type="number"
            value={profile.personal.age}
            onChange={(v) => set("personal", { ...profile.personal, age: v })}
          />
          <Field
            label="Sitio web"
            value={profile.personal.website}
            onChange={(v) => set("personal", { ...profile.personal, website: v })}
          />
          <Field
            label="Foto (ruta, ej. data/raw/images/foto.jpg)"
            value={profile.personal.photo_path}
            onChange={(v) => set("personal", { ...profile.personal, photo_path: v })}
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Redes sociales
          </h3>
          <ArrayEditor
            items={profile.personal.social_networks}
            onChange={(v) => set("personal", { ...profile.personal, social_networks: v })}
            addLabel="red social"
            newItem={() => ({ platform: "", url: "" })}
            renderItem={(item, _i, update) => (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field
                  label="Plataforma"
                  value={item.platform}
                  onChange={(v) => update({ ...item, platform: v })}
                />
                <Field label="URL" value={item.url} onChange={(v) => update({ ...item, url: v })} />
              </div>
            )}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Resumen"
        description="Se usa como base para el summary reescrito a la medida de cada vacante (Fase 4)."
      >
        <TextAreaField
          label="Resumen (ES)"
          value={profile.summary.es}
          onChange={(v) => set("summary", { ...profile.summary, es: v })}
          rows={4}
        />
        <TextAreaField
          label="Resumen (EN)"
          value={profile.summary.en}
          onChange={(v) => set("summary", { ...profile.summary, en: v })}
          rows={4}
        />
      </SectionCard>

      <SectionCard title="Empresas fundadas" description="Opcional.">
        <ArrayEditor
          items={profile.founded_companies}
          onChange={(v) => set("founded_companies", v)}
          addLabel="empresa"
          newItem={() => ({
            name: "",
            role_es: "",
            role_en: "",
            url: "",
            description_es: "",
            description_en: "",
          })}
          renderItem={(item, _i, update) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Nombre" value={item.name} onChange={(v) => update({ ...item, name: v })} />
              <Field label="URL" value={item.url} onChange={(v) => update({ ...item, url: v })} />
              <Field
                label="Rol (ES)"
                value={item.role_es}
                onChange={(v) => update({ ...item, role_es: v })}
              />
              <Field
                label="Rol (EN)"
                value={item.role_en}
                onChange={(v) => update({ ...item, role_en: v })}
              />
              <Field
                label="Descripción (ES)"
                value={item.description_es}
                onChange={(v) => update({ ...item, description_es: v })}
              />
              <Field
                label="Descripción (EN)"
                value={item.description_en}
                onChange={(v) => update({ ...item, description_en: v })}
              />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Educación">
        <ArrayEditor
          items={profile.education}
          onChange={(v) => set("education", v)}
          addLabel="estudio"
          emptyLabel="Sin educación registrada todavía."
          newItem={() => ({
            id: newId("edu"),
            institution: "",
            degree_es: "",
            degree_en: "",
            start_date: "",
            end_date: "",
            location: "",
          })}
          renderItem={(item, _i, update) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="Institución"
                value={item.institution}
                onChange={(v) => update({ ...item, institution: v })}
              />
              <div />
              <Field
                label="Título (ES)"
                value={item.degree_es}
                onChange={(v) => update({ ...item, degree_es: v })}
              />
              <Field
                label="Título (EN)"
                value={item.degree_en}
                onChange={(v) => update({ ...item, degree_en: v })}
              />
              <Field
                label="Inicio (YYYY-MM) *"
                value={item.start_date}
                onChange={(v) => update({ ...item, start_date: v })}
                placeholder="2021-01"
              />
              <Field
                label="Fin (YYYY-MM o present)"
                value={item.end_date}
                onChange={(v) => update({ ...item, end_date: v })}
                placeholder="2026-01"
              />
              <Field
                label="Ubicación"
                value={item.location}
                onChange={(v) => update({ ...item, location: v })}
              />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Experiencia">
        <ArrayEditor
          items={profile.experience}
          onChange={(v) => set("experience", v)}
          addLabel="experiencia"
          emptyLabel="Sin experiencia registrada todavía."
          newItem={() => ({
            id: newId("exp"),
            company: "",
            role_es: "",
            role_en: "",
            start_date: "",
            end_date: "",
            location: "",
            bullets: [],
          })}
          renderItem={(item, _i, update) => (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field
                  label="Empresa"
                  value={item.company}
                  onChange={(v) => update({ ...item, company: v })}
                />
                <div />
                <Field
                  label="Rol (ES)"
                  value={item.role_es}
                  onChange={(v) => update({ ...item, role_es: v })}
                />
                <Field
                  label="Rol (EN)"
                  value={item.role_en}
                  onChange={(v) => update({ ...item, role_en: v })}
                />
                <Field
                  label="Inicio (YYYY-MM) *"
                  value={item.start_date}
                  onChange={(v) => update({ ...item, start_date: v })}
                  placeholder="2026-01"
                />
                <Field
                  label="Fin (YYYY-MM o present)"
                  value={item.end_date}
                  onChange={(v) => update({ ...item, end_date: v })}
                  placeholder="present"
                />
                <Field
                  label="Ubicación"
                  value={item.location}
                  onChange={(v) => update({ ...item, location: v })}
                />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Bullets</h4>
                <BulletsEditor
                  bullets={item.bullets}
                  onChange={(v) => update({ ...item, bullets: v })}
                />
              </div>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Proyectos">
        <ArrayEditor
          items={profile.projects}
          onChange={(v) => set("projects", v)}
          addLabel="proyecto"
          emptyLabel="Sin proyectos registrados todavía."
          newItem={() => ({ id: newId("proj"), name: "", date: "", bullets: [] })}
          renderItem={(item, _i, update) => (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Nombre" value={item.name} onChange={(v) => update({ ...item, name: v })} />
                <Field label="Fecha" value={item.date} onChange={(v) => update({ ...item, date: v })} />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Bullets</h4>
                <BulletsEditor
                  bullets={item.bullets}
                  onChange={(v) => update({ ...item, bullets: v })}
                />
              </div>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Skills técnicos">
        <ArrayEditor
          items={profile.technical_skills}
          onChange={(v) => set("technical_skills", v)}
          addLabel="categoría"
          newItem={() => ({ category_es: "", category_en: "", items: [] })}
          renderItem={(item, _i, update) => (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field
                  label="Categoría (ES)"
                  value={item.category_es}
                  onChange={(v) => update({ ...item, category_es: v })}
                />
                <Field
                  label="Categoría (EN)"
                  value={item.category_en}
                  onChange={(v) => update({ ...item, category_en: v })}
                />
              </div>
              <StringListEditor
                items={item.items}
                onChange={(v) => update({ ...item, items: v })}
                placeholder="skill"
              />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Soft skills">
        <StringListEditor
          items={profile.soft_skills}
          onChange={(v) => set("soft_skills", v)}
          placeholder="soft skill"
        />
      </SectionCard>

      <SectionCard title="Idiomas">
        <ArrayEditor
          items={profile.languages}
          onChange={(v) => set("languages", v)}
          addLabel="idioma"
          newItem={() => ({ language: "", level: "" })}
          renderItem={(item, _i, update) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="Idioma"
                value={item.language}
                onChange={(v) => update({ ...item, language: v })}
              />
              <Field label="Nivel" value={item.level} onChange={(v) => update({ ...item, level: v })} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Certificaciones / compliance">
        <StringListEditor
          items={profile.certifications_compliance}
          onChange={(v) => set("certifications_compliance", v)}
          placeholder="certificación"
        />
      </SectionCard>
    </div>
  );
}
