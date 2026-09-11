# Instrucciones para Claude Code sobre `update-cv`

Este archivo cubre tres cosas distintas, dos de las cuales comparten la palabra "agente"
sin tener relación entre sí — no confundirlas:

1. **Orquestación del backlog** (sección inmediatamente debajo): cómo Claude Code decide
   entre subagentes en paralelo o trabajo secuencial al desarrollar los tickets del
   [GitHub Project](https://github.com/users/Deivs117/projects/9). Aplica a cualquier
   sesión trabajando en este repo, siempre.
2. **Flujo de ramas, worktrees y Kanban**: cómo se nombran/organizan las ramas, por qué todo
   trabajo con commits pasa por un `git worktree`, y cuándo mover un ticket entre columnas
   del Project. Aplica siempre también.
3. **Modo Agente** (a partir de "Cuando el usuario te pida..." más abajo): el contrato de
   tareas del buzón `.claude-tasks/`, que es una **funcionalidad del producto** `update-cv`
   (ver "Conectores con el modelo (API / Agente)" en el `README.md`) — solo aplica cuando
   el usuario pide explícitamente procesar esas tareas.

---

## Orquestación del backlog: subagentes en paralelo vs. trabajo secuencial

Al trabajar un conjunto de tareas relacionado (típicamente todos los issues de un milestone
del Project, o el subconjunto que el usuario defina), la decisión de cómo repartir el
trabajo sigue esta regla:

- **Primero, el agente maestro (quien planea, no un subagente) evalúa si el grupo tiene
  capacidad real de paralelización**: ¿hay tareas del grupo que no dependan entre sí, no
  toquen el mismo archivo/módulo, y cuyo resultado no bloquee a otra tarea del mismo grupo?
  No se asume paralelizable solo porque los tickets comparten milestone — varios issues de
  un mismo milestone pueden tener dependencia secuencial real entre sí (ver el orden de
  dependencias documentado en cada milestone).
- **Si hay capacidad de paralelización Y el usuario pide explícitamente lanzar
  subagentes**, se reparte el grupo en subagentes — uno por tarea o por sub-grupo
  independiente — cada uno operando en su propio `git worktree` para no pisarse (criterio
  de ramas/worktrees: ver #3 una vez esté documentado).
- **Si no hay paralelización posible** (las tareas dependen entre sí — una debe
  terminar/fusionarse antes de que la siguiente tenga sentido), un solo agente las resuelve
  **secuencialmente**, una detrás de otra, hasta agotar el grupo completo, sin esperar a que
  el usuario pida lanzar subagentes en cada paso — ese es el modo por defecto.
- Lanzar subagentes en paralelo **requiere pedido explícito del usuario cada vez**, nunca es
  una decisión unilateral del agente maestro aunque detecte que el grupo es paralelizable.
- Nunca paralelizar tareas con dependencia real entre sí solo porque el usuario pidió
  paralelizar el grupo completo — identificar primero cuáles subtareas sí son
  independientes dentro del grupo, y limitar los subagentes a esas.

---

## Flujo de ramas, worktrees y Kanban

Trunk-based, sin rama `develop` — cada PR/rama ya obtiene su propio preview de Vercel, así
que una rama de staging intermedia no aporta nada en un proyecto de este tamaño (a
diferencia de `PruebasCorteGrabadoLaser`, que sí usa GitFlow completo por ser un equipo más
grande; ver decisión tomada en la planeación de `feature/deploy`, issue #19).

```
main                                ← producción, deploy automático (Vercel)
 └── feature/<categoría>            ← repo / data / backend / deploy / frontend (permanentes)
       └── <sub-rama por ticket>    ej. repo-branch-flow-3
```

- Las tareas puntuales salen de la rama de categoría correspondiente (`feature/repo`,
  `feature/data`, `feature/backend`, `feature/deploy`, `feature/frontend`), nunca directo de
  `main`.
- Orden de promoción, siempre por PR: sub-rama → `feature/<categoría>` → `main`. Cada salto
  corre el CI (`.github/workflows/ci.yml`).
- Todo commit sigue Conventional Commits (`tipo(área): mensaje`, ver
  `.pre-commit-config.yaml`) y todo PR referencia un ticket (`Closes #N`/`Refs #N`, ver
  `.github/PULL_REQUEST_TEMPLATE.md`) — es lo que da trazabilidad entre código y el
  [Project](https://github.com/users/Deivs117/projects/9).

### `git worktree` obligatorio para toda tarea con rama/commits

Nunca trabajar una rama nueva directo en el directorio principal del repo — ni una sesión
agéntica ni una humana. Un worktree aísla físicamente los archivos de cada tarea, así dos
sesiones (o una sesión y el propio usuario) pueden trabajar en paralelo sin pisarse:

```
git fetch origin
git worktree add ../wt-<algo-descriptivo> -b <categoría>-<slug>-<issue> origin/feature/<categoría>
```

Al terminar y mergear la tarea: **cerrar el worktree ANTES de borrar la rama**, no después —
`gh pr merge <n> --merge --delete-branch` falla con `cannot delete branch ... used by
worktree` si el worktree sigue abierto (pasó varias veces mergeando los tickets de este
mismo milestone). Orden correcto:

```
git worktree remove ../wt-<algo> --force
gh pr merge <n> --merge --delete-branch
```

Si el borrado remoto ya falló por esto, `git branch -d <sub-rama>` (local) y
`git push origin --delete <sub-rama>` (remoto) por separado, una vez cerrado el worktree.

### Estado del ticket en el Project (Kanban)

El [Project](https://github.com/users/Deivs117/projects/9) (número 9, owner `Deivs117`)
tiene 5 columnas (campo `Status`, id `PVTSSF_lAHOCM1xRc4BjM5lzhiCJfY` del proyecto
`PVT_kwHOCM1xRc4BjM5l`) y el ticket tiene que reflejar en qué paso real está:

| Columna | Cuándo mover el ticket acá | Option id |
|---|---|---|
| **Backlog** | Existe pero no está priorizado/asignado a un milestone activo todavía. | `09e0374b` |
| **Todo** | Priorizado, sin bloqueos — el siguiente que se toma. | `f75ad846` |
| **In Progress** | Apenas se abre el worktree/rama de la tarea — no al terminarla. | `47fc9ee4` |
| **In Revision** | Código completo, PR(s) abiertos/mergeados subiendo por la cadena de ramas (sub-rama → `feature/<categoría>`) pero todavía no en `main`. | `2e03ba67` |
| **Done** | Recién cuando llegó a `main` (desplegado a producción) — nunca antes, aunque el código ya esté "terminado" en `feature/<categoría>`. | `98236657` |

Agregar un issue nuevo al Project (paso aparte de `gh issue create`):

```
gh project item-add 9 --owner Deivs117 --url <url-del-issue>
```

Mover el estado:

```
gh project item-edit --project-id PVT_kwHOCM1xRc4BjM5l --id <item-id> \
  --field-id PVTSSF_lAHOCM1xRc4BjM5lzhiCJfY --single-select-option-id <option-id>
```

El `item-id` (no es el número del issue) sale del `item-add` de arriba o de
`gh project item-list 9 --owner Deivs117`.

---

## Modo Agente (funcionalidad del producto)

El modo Agente existe para poder usar el sistema **sin `ANTHROPIC_API_KEY`**: la web app
escribe una tarea en `.claude-tasks/pending/`, y tú (Claude Code, corriendo en una terminal
del usuario dentro de este repo) la procesas y escribes el resultado en `.claude-tasks/done/`.
La web app queda esperando (polling) ese resultado.

### Cuando el usuario te pida "procesar tareas pendientes" (o similar)

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

### `extract_profile` (Módulo 1, sección 7)

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

### `analyze_job` (Módulo 3, sección 9.2)

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

### `tailor_cv` (Módulo 3, sección 9.3)

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

### `generate_cover_letter` (Módulo 4, sección 10)

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

### Reglas generales

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
