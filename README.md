# update-cv

Sistema **100% local** para generar CVs a la medida de cada vacante de empleo, a partir de
un perfil canónico (`data/profile.json`), plantillas LaTeX ATS-safe y compilación local a PDF.

Ver `ARQUITECTURA_update-cv.md` para la especificación completa del sistema.

> Este README se va completando fase por fase (ver roadmap en la sección 16 de
> `ARQUITECTURA_update-cv.md`). Lo que sigue documenta el estado real del repo hoy.

## Estado del proyecto

- [x] Fase 0 — Setup
- [x] Fase 1 — Extracción (demo)
- [x] Fase 2 — Interfaz de perfil
- [x] Fase 3 — Plantillas y compilación
- [x] Fase 4 — Motor de generación a medida
- [x] Fase 5 — Carta de presentación
- [x] Fase 6 — Modo Agente
- [ ] Fase 7 — Pulido

## Decisiones ajustadas durante la construcción (vs. el documento original)

- **Regla de una página (sección 9.4/9.6):** en vez de un límite duro que recorta contenido
  automáticamente o bloquea la generación, el máximo de páginas recomendado según años de
  experiencia se muestra como **retroalimentación en la UI** (ej. "tu CV quedó en 3 páginas;
  se recomienda máximo 1-2 para tu nivel de experiencia"), pero el usuario decide si recorta
  o no. Se implementa en la Fase 4.
- **Plantilla visual secundaria con foto** (ver sección "Plantilla visual" más abajo) --
  prevista ya en el documento original como opción secundaria, ahora implementada.
- **Campos bilingües adicionales** (ver sección "Campos bilingües" más abajo).

## Notas de la Fase 4 (motor de generación a medida)

- `/nueva-aplicacion`: wizard de 3 pasos (vacante → opciones → resultado).
- `POST /api/nueva-aplicacion/analyze`: análisis de vacante (sección 9.2) -- devuelve skills
  técnicas, soft skills, keywords de sector y seniority, siempre en el mismo idioma que el
  texto de la vacante (clave para el matching léxico ATS).
- `POST /api/nueva-aplicacion/generate`: orquesta todo el pipeline -- carga `profile.json`,
  calcula la recomendación de páginas (`experience-years.ts`), llama a `tailorCV` (selección
  y reescritura de bullets por relevancia a la vacante, sección 9.3), renderiza y compila
  (ATS o visual), cuenta páginas, y escribe `apps/{empresa}-{puesto}-{fecha}/`.
- `web/lib/tailoring.ts`: arma el "contenido candidato" (bullets con id, en el idioma
  destino) que se envía a Claude, y **resuelve la respuesta de vuelta contra el perfil
  real por id** -- company/rol/fechas nunca se toman de lo que Claude devuelve, solo el
  texto reescrito y la selección/orden de bullets. Evita que una alucinación del modelo
  corrompa datos estructurales.
- `GET /api/apps/[...path]`: sirve `cv.pdf`/`cv.tex`/`job_description.txt` para la
  previsualización embebida (restringido a `apps/`, sin path traversal).
- Probado de punta a punta con una vacante real (Junior Software Engineer @ Power Digital):
  análisis correcto en inglés, selección de bullets relevante sin inventar tecnologías que
  el candidato no tiene, resultado de 2 páginas con la recomendación (1 página) mostrada
  como retroalimentación no bloqueante.
- **Bug real corregido:** el análisis de vacante y la carta de presentación a veces salían
  en español aunque la vacante/CV estuvieran en inglés (los system prompts están escritos en
  español, lo que sesgaba al modelo). Se agregó una instrucción explícita de idioma objetivo
  en cada prompt (`buildTailorCVUserPrompt`/`buildCoverLetterUserPrompt`/análisis), en vez de
  confiar en "responde en el mismo idioma que el contenido recibido".

## Notas de la Fase 5 (carta de presentación)

- `templates/latex/cover-letter-{es,en}.tex.tpl`: plantilla ATS-safe de una columna (mismo
  estilo que el CV). `web/lib/latex/render-cover-letter.ts` la rellena reusando
  `buildContactLine`/`escapeLatex` de render.ts.
- `generateCoverLetter` en `api-connector.ts`: reusa el mismo `jobAnalysis` del CV (no
  re-analiza la vacante), y solo genera el CUERPO de la carta -- saludo/fecha/despedida
  los agrega la plantilla, no el modelo.
- En `/nueva-aplicacion`, checkbox opcional + elección de formato PDF (compilado) o texto
  plano (textarea + botón "Copiar", sin compilar). `POST /api/nueva-aplicacion/generate`
  escribe `cover_letter.pdf`/`.tex` o `cover_letter.txt` junto al CV en la misma carpeta
  de la aplicación.
- Probado con la vacante real de Power Digital en ambos formatos e idiomas (PDF en inglés,
  texto en español) -- contenido coherente, sin inventar logros ni mezclar idiomas.

## Requisitos

- Node.js 20+ y npm (probado con Node 26 / npm 11).
- `tectonic` instalado en el sistema (compilador LaTeX). Alternativa: `pdflatex` (TeXLive).
  - Arch Linux: `sudo pacman -S tectonic`
  - Si el mirror falla (404), primero refresca mirrors: `sudo pacman -Syyu`, o instala
    desde AUR: `paru -S tectonic-bin`.
  - Otras plataformas: ver https://tectonic-typesetting.github.io/en-US/install.html
- Una `ANTHROPIC_API_KEY` si vas a usar el modo API (no es necesaria si solo usas el modo
  Agente vía Claude Code). Se obtiene en https://console.anthropic.com/

## Arranque desde cero

```bash
git clone <este-repo>
cd update-cv

# Variables de entorno
cp .env.example .env
# Edita .env y agrega tu ANTHROPIC_API_KEY si vas a usar modo API

# Instalar dependencias de la web app
cd web
npm install

# Levantar el servidor de desarrollo
npm run dev
# Abre http://localhost:3000
```

## Tus propios datos (si no eres David)

- `data/raw/` trae como semilla el CV de David Caicedo Samboni **solo para la demo inicial**.
  Si vas a usar este sistema con tus propios datos, reemplaza el contenido de `data/raw/`
  con tu propio CV (PDF) e imágenes, y considera sacar `data/` del control de versiones
  (ver sección 13 de `ARQUITECTURA_update-cv.md`).
- `data/profile.json` es tu perfil canónico; se crea/edita desde la interfaz web
  (`/perfil`) o desde el flujo de extracción inicial (Fase 1).

## Estructura del repositorio

Ver sección 5 de `ARQUITECTURA_update-cv.md`. Resumen:

```
update-cv/
├── data/                  # profile.json, schema, y datos de semilla (data/raw/)
├── apps/                  # Salidas: una carpeta por cada aplicación de empleo generada
├── templates/latex/       # Plantillas .tex.tpl ATS-safe (CV y carta de presentación)
├── web/                   # Aplicación Next.js (interfaz local)
├── .claude-tasks/         # Buzón de tareas del modo Agente (gitignored)
├── CLAUDE.md              # Instrucciones para Claude Code en modo Agente
└── ARQUITECTURA_update-cv.md
```

## Notas de la Fase 0

- `tectonic` no se vendoriza en el repo (decisión confirmada): cada usuario lo instala
  como binario del sistema. Ver sección "Requisitos" arriba.
- `data/raw/images/` contiene por ahora capturas de pantalla del CV web actual de David
  (no fotos físicas de proyectos/certificados) — se usan como apoyo de contexto en la
  extracción inicial (Fase 1), no como fuente exhaustiva.

## Notas de la Fase 1 (extracción)

- `cd web && npm run extract-profile` procesa `data/raw/` (PDF + imágenes) y escribe
  `data/profile.draft.json` — un borrador, nunca sobreescribe `data/profile.json`.

## Notas de la Fase 2 (editor de perfil)

- `/perfil` es el editor CRUD completo del perfil. Al entrar, si no existe
  `data/profile.json` pero sí un `data/profile.draft.json` (de una extracción previa),
  lo carga automáticamente como punto de partida para revisión.
- El botón "Importar desde PDF/imágenes" dispara la extracción de nuevo y reemplaza el
  contenido del formulario (sin guardar) — hay que presionar "Guardar perfil" para
  confirmarlo como definitivo.
- El reordenado de bullets/listas usa botones ↑/↓ en vez de drag-and-drop nativo (más
  confiable entre navegadores).

## Notas de la Fase 3 (plantillas y compilación)

- `templates/latex/cv-{es,en}.tex.tpl`: plantillas ATS-safe (una columna, sin tablas,
  iconos ni imágenes). `web/lib/latex/render.ts` las rellena con escape correcto de
  caracteres especiales de LaTeX (`&`, `%`, `_`, `#`, `$`, etc.).
- `web/lib/latex/compile.ts` ejecuta `tectonic` (o `pdflatex` si `LATEX_ENGINE=pdflatex`
  en `.env`) y guarda el log completo en `compile.log` junto al PDF, tanto en éxito como
  en fallo.
- `web/lib/latex/page-count.ts` verifica el número real de páginas del PDF con `pdf-lib`.
- Prueba de punta a punta (sin IA, perfil de ejemplo estático):
  ```bash
  cd web && npm run test-latex
  ```
  Genera `.fase3-test-output/cv-es.pdf`, `cv-en.pdf`, y `.fase3-test-output/visual/cv-visual.pdf`
  (carpeta gitignored, no es una aplicación real de `apps/`).

### Plantilla visual secundaria (opcional, NO ATS-safe)

- `templates/latex/cv-visual.tex.tpl` + `templates/latex/visual/` (clase `documentMETADATA.cls`
  adaptada de un derivado de Awesome-CV/YAAC aportado por el usuario, + fuentes Source Sans Pro).
  Con foto, iconos y color -- solo para enviar directo a un humano, nunca para ATS.
- Requiere que `personal.photo_path` apunte a una imagen real en `data/raw/images/`.
- `web/lib/latex/render-visual.ts` arma el `.tex` con los macros de esa clase;
  `prepareVisualAssets()` copia `documentMETADATA.cls`, `fonts/`, y la foto junto al `.tex`
  antes de compilar (tectonic los necesita en el mismo directorio).
- La clase original tenía dos bugs reales que se corrigieron al adaptarla: (1) usaba
  `luainputenc`, exclusivo de LuaLaTeX, que rompía con tectonic (motor XeTeX) -- se quitó,
  ya que XeTeX maneja UTF-8 nativamente vía `fontspec`; (2) el comando de foto usaba una
  clave de `tikz` (`fill overzoom image`) que nunca estaba definida -- se reemplazó por
  `\includegraphics` estándar.
- Selector para elegir esta plantilla en el wizard llega en la Fase 4.
- Los íconos de encabezado de sección se redujeron a `\normalsize` (el título del section
  queda en `\Large`) para menos saturación visual y más espacio para texto.

### Campos bilingües (corrección de idioma mixto)

Varios campos de texto libre eran de un solo idioma y por eso el CV generado en un idioma
mostraba texto suelto en el otro (ej. el "tagline" bajo el nombre seguía en inglés en la
versión en español). Ahora tienen variantes `_es`/`_en`, igual que los bullets:

- `personal.headline` → `headline_es` / `headline_en`
- `founded_companies[].role` → `role_es` / `role_en`, `.description` → `description_es` / `description_en`
- `experience[].role` → `role_es` / `role_en`
- `education[].degree` → `degree_es` / `degree_en`
- `technical_skills[].category` → `category_es` / `category_en`
- `soft_skills[]`: de `string[]` a `{ text_es, text_en }[]`
- `languages[]`: `language`/`level` → `language_es`/`language_en`/`level_es`/`level_en`

Los nombres propios (`company`, `institution`, `name` de empresa) NO se traducen.

## Notas de la Fase 6 (modo Agente)

- `web/lib/claude/agent-connector.ts`: implementa el mismo `ClaudeConnector` que
  `api-connector.ts`, pero escribiendo una tarea en `.claude-tasks/pending/{task_id}.json` y
  esperando (polling) el resultado en `.claude-tasks/done/{task_id}.result.json`. La petición
  HTTP queda bloqueada hasta que el resultado aparece o se cumple `AGENT_TASK_TIMEOUT_MS`
  (decisión tomada con el usuario: bloqueo simple con timeout largo en vez de un flujo de
  2 pasos con botón "verificar" -- más simple para un MVP personal).
- `web/lib/claude/get-connector.ts`: fábrica que elige `ApiConnector`/`AgentConnector` según
  `CLAUDE_MODE` en `.env`, con posibilidad de override puntual (`claudeMode`/`mode` en el
  body de las rutas, y un selector en `/nueva-aplicacion` y en el botón de importar de
  `/perfil`).
- `CLAUDE.md`: instrucciones completas para que Claude Code procese cada tipo de tarea
  (`extract_profile`, `analyze_job`, `tailor_cv`, `generate_cover_letter`), con la forma
  exacta de entrada/salida de cada una, remitiendo a `web/lib/claude/prompts.ts` para
  mantener paridad con el modo API.
- Variables nuevas en `.env.example`: `AGENT_POLL_INTERVAL_MS` (default 3000) y
  `AGENT_TASK_TIMEOUT_MS` (default 900000 = 15 min).
- Probado de punta a punta simulando manualmente el rol de Claude Code (escribir el
  resultado en `.claude-tasks/done/`): la tarea se crea, la petición queda esperando, el
  resultado se recoge correctamente y el archivo de `pending/` se limpia. También se probó
  el camino de timeout (sin nadie procesando la tarea): mensaje de error claro con el `task_id`
  y la ruta del archivo pendiente.
