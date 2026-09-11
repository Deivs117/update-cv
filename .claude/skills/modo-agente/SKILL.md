---
name: modo-agente
description: Procesar el buzón de tareas del "Modo Agente" de update-cv (.claude-tasks/pending/) cuando el usuario pide "procesar tareas pendientes" o similar. Es la funcionalidad que permite usar el sistema sin ANTHROPIC_API_KEY — la web app escribe una tarea y Claude Code, corriendo en una terminal del usuario dentro de este repo, la procesa.
---

# Modo Agente de `update-cv`

Esta skill implementa el contrato del Modo Agente descrito en "Conectores con el modelo
(API / Agente)" del `README.md` del repo. Existe para poder usar el sistema **sin
`ANTHROPIC_API_KEY`**: la web app escribe una tarea en `.claude-tasks/pending/`, y tú
(Claude Code, corriendo en una terminal del usuario dentro de este repo) la procesas y
escribes el resultado en `.claude-tasks/done/`. La web app queda esperando (polling) ese
resultado.

## Cuando el usuario te pida "procesar tareas pendientes" (o similar)

1. Lee todos los archivos `.json` en `.claude-tasks/pending/`.
2. Para cada uno, según su campo `"type"`, sigue la sección correspondiente más abajo.
3. Escribe el resultado en la ruta indicada por el campo `"output_path"` de la propia tarea
   (relativa a la raíz del repo), como JSON válido con la forma exacta que se describe abajo.
4. **No borres el archivo de `pending/`** — la web app lo borra ella misma tras leer el
   resultado (si el archivo de `pending/` sigue ahí después de que tú terminaste, no es un
   error tuyo; solo significa que la web app todavía no lo confirmó).
5. Si una tarea no tiene sentido o le faltan datos, escribe igualmente un resultado válido
   lo más razonable posible en vez de dejarla sin respuesta (la web app tiene su propio
   timeout y validación, pero prefiere que intentes responder).

Los prompts exactos que usa el modo API están en `web/lib/claude/prompts.ts` —
**revisa ese archivo antes de procesar una tarea** y sigue el mismo criterio, para que el
modo Agente y el modo API produzcan resultados equivalentes.

---

## `extract_profile` (Módulo 1, sección 7)

**Entrada** (campos de la tarea):
- `input_pdf`: ruta relativa al PDF del CV.
- `input_images`: array de rutas relativas a imágenes de apoyo (puede estar vacío).

**Qué hacer:** lee el PDF (y las imágenes si hay) y extrae un perfil canónico, siguiendo
exactamente las reglas de `EXTRACT_PROFILE_SYSTEM_PROMPT` en `web/lib/claude/prompts.ts`
(bullets bilingües `text_es`/`text_en`, ids estables, fechas `YYYY-MM`, no inventar datos).

**Salida esperada** (en `output_path`): un objeto JSON con la forma de `ProfileDraft`
(ver `data/profile.schema.json` y `web/lib/validation/profile.zod.ts` —
`profileDraftSchema`). Todos los campos son opcionales excepto que el schema diga lo
contrario; omite lo que no puedas determinar con confianza.

---

## `analyze_job` (Módulo 3, sección 9.2)

**Entrada:** `job_description` (texto completo de la vacante).

**Qué hacer:** sigue `ANALYZE_JOB_SYSTEM_PROMPT`. **Importante:** todo el contenido de la
respuesta debe estar en el mismo idioma en que está escrita la vacante (si la vacante está
en inglés, responde en inglés) — esto es clave para el matching léxico ATS, no traduzcas
por defecto al español.

**Salida esperada:**
```json
{
  "required_technical_skills": string[],
  "soft_skills": string[],
  "sector_keywords": string[],
  "seniority": string
}
```

---

## `tailor_cv` (Módulo 3, sección 9.3)

**Entrada:**
- `candidate_content`: JSON con el contenido disponible del candidato (`summary`,
  `experience[]`/`projects[]` con bullets que tienen `id`, `text`, `keywords`,
  `technical_skills[]`, `soft_skills[]`, `certifications_compliance[]`) — ya resuelto al
  idioma destino.
- `job_description`, `job_analysis`, `recommended_max_pages`, `language`.

**Qué hacer:** sigue `TAILOR_CV_SYSTEM_PROMPT`. Selecciona y reescribe bullets relevantes
para esa vacante específica **sin inventar logros/tecnologías** que no estén en el
contenido recibido, referenciando siempre los `id` reales recibidos. `soft_skills` se puede
reescribir/reformular (mismo tono que pida la vacante) pero sin inventar habilidades que el
candidato no reportó. `certifications_compliance` se selecciona (subconjunto textual EXACTO
de lo recibido, sin reescribir) según relevancia para el puesto — ej. no incluir una
certificación de diseño CAD en una vacante de backend. El número de páginas recomendado es
orientativo, no obligatorio de cumplir a la fuerza. Todo el texto que generes debe estar en
`language` (no mezclar idiomas, sin importar el idioma de la vacante).

**Salida esperada:**
```json
{
  "summary": string,
  "experience": [{ "id": string, "bullets": [{ "id": string, "text": string, "keywords": string[] }] }],
  "projects": [{ "id": string, "bullets": [{ "id": string, "text": string, "keywords": string[] }] }],
  "technical_skills": [{ "category": string, "items": string[] }],
  "soft_skills": string[],
  "certifications_compliance": string[]
}
```

---

## `generate_cover_letter` (Módulo 4, sección 10)

**Entrada:** `candidate_content`, `job_description`, `job_analysis`, `company`, `role`,
`language` (mismos campos que `tailor_cv` más `company`/`role`).

**Qué hacer:** sigue `COVER_LETTER_SYSTEM_PROMPT`. Escribe SOLO el cuerpo de la carta
(2-4 párrafos, sin saludo ni despedida ni firma — eso lo agrega la plantilla LaTeX), en
`language`, sin inventar logros que el candidato no tiene.

**Salida esperada:**
```json
{ "body": string }
```

---

## Reglas generales

- Nunca sobrescribas `data/profile.json` directamente — solo el usuario, desde el editor
  web, confirma y persiste cambios al perfil.
- Todo texto generado en `es` o `en` debe respetar el idioma pedido en la tarea, sin mezclar
  (revisa `web/lib/claude/prompts.ts` — varias instrucciones insisten en esto porque el
  modelo tiende a responder en español por defecto si no se le pide explícitamente lo
  contrario).
- Sigue las reglas de la plantilla ATS-safe ("Plantillas y compilación LaTeX" en el
  `README.md`) en cualquier texto libre que generes: sin markdown, sin caracteres LaTeX sin
  escapar (el escape lo hace `render.ts` del lado de la web app, tú solo entregas texto
  plano).
