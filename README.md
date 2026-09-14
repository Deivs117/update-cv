# update-cv

Sistema que genera **CVs y cartas de presentación a la medida de cada vacante**, a partir de
un perfil profesional canónico. Cada aplicación se analiza contra el texto real de la oferta,
se reescribe con el vocabulario de esa vacante específica (clave para el matching léxico de
los ATS), se compila a PDF vía LaTeX, y queda archivada en su propia carpeta con la vacante
original guardada junto al resultado, para trazabilidad.

Corre localmente sobre Next.js. No depende de una base de datos: el perfil vive en un único
JSON versionable y cada aplicación generada es una carpeta autocontenida en el sistema de
archivos.

## Qué hace

- **Perfil canónico único** (`data/profile.json`): datos personales, experiencia, proyectos,
  educación, skills técnicas y blandas, idiomas y certificaciones — con bullets bilingües
  (`text_es`/`text_en`) e ids estables por bullet, para poder seleccionarlos, reordenarlos y
  reescribirlos sin perder trazabilidad hacia el dato original.
- **Extracción automática desde un CV existente**: lee un PDF (y opcionalmente imágenes de
  apoyo) y produce un borrador de perfil estructurado, revisable antes de guardarse — nunca
  sobreescribe el perfil real sin confirmación explícita del usuario.
- **Editor de perfil** (`/perfil`): CRUD completo sobre el JSON canónico, con validación en
  tiempo real (Zod) y reordenado de bullets/listas.
- **Generación de CV a la medida** (`/nueva-aplicacion`): wizard de 3 pasos — pegar la
  vacante → elegir idioma y opciones → generar. El motor:
  1. Analiza la vacante (skills técnicas, soft skills, keywords de sector, seniority),
     siempre en el mismo idioma en que está escrita la oferta.
  2. Selecciona y reescribe los bullets, skills, soft skills y certificaciones relevantes
     para esa vacante específica, **sin inventar tecnologías ni logros** que no estén en el
     perfil — la respuesta del modelo se resuelve de vuelta contra el perfil real por `id`,
     así que una alucinación nunca puede corromper datos estructurales (empresa, fechas,
     etc.), solo el texto y el orden de lo que ya existe.
  3. Renderiza la plantilla LaTeX correspondiente y compila el PDF localmente.
  4. Verifica el número real de páginas del PDF resultante y lo muestra como
     retroalimentación en la UI frente a la recomendación por años de experiencia (el límite
     es orientativo, no bloquea la generación).
- **Carta de presentación opcional**: reutiliza el mismo análisis de vacante que el CV (no
  se re-analiza dos veces), genera solo el cuerpo del texto (2-4 párrafos, sin inventar
  logros), y se entrega como PDF compilado o como texto plano para copiar/pegar.
- **Historial de aplicaciones** (`/aplicaciones`): lista cada aplicación generada con acceso
  directo a la vacante original y al detalle.
- **Detalle de aplicación** (`/aplicaciones/[slug]`): previsualización embebida del PDF,
  botón "Regenerar con mi perfil actual" (re-corre todo el pipeline reusando la misma
  carpeta, útil tras editar el perfil), y un editor de LaTeX avanzado para ajustes finos de
  último minuto sin volver a llamar al modelo — con el log de compilación completo visible
  en la UI si algo falla.
- **Dos formas de conectar con el modelo**, intercambiables por variable de entorno o desde
  la propia interfaz:
  - **Modo API**: llamadas directas a la API de Anthropic (`ANTHROPIC_API_KEY`).
  - **Modo Agente**: sin API key. La web app escribe la tarea en un buzón de archivos
    (`.claude-tasks/pending/`) y Claude Code —corriendo en una terminal del usuario dentro
    del repo, ya sea a pedido o mediante un watcher automático (`npm run agent:watch`)—
    la procesa y devuelve el resultado en `.claude-tasks/done/`. Ambos modos implementan el
    mismo contrato (`ClaudeConnector`), así que el resto del sistema no distingue cuál se
    usó.
- **Generación no bloqueante**: analizar una vacante o generar un CV encola un job y devuelve
  de inmediato; el cliente hace polling y ve el progreso en vivo (`Analizando...`,
  `Adaptando tu contenido...`, `Compilando el PDF...`) sin dejar la pestaña colgada.

## Arquitectura

```mermaid
flowchart TB
    subgraph Perfil["Perfil canónico"]
        PROFILE[(profile.json)]
        SCHEMA[[profile.schema.json]]
    end

    subgraph Extraccion["Extracción desde CV existente"]
        EXT[Conector Claude<br/>API o Agente]
    end

    subgraph WebApp["Interfaz web (Next.js)"]
        UI_EDIT["/perfil"]
        UI_NEW["/nueva-aplicacion"]
        UI_HIST["/aplicaciones"]
    end

    subgraph Motor["Motor de generación"]
        ANALYZE[Análisis de vacante]
        TAILOR[Selección y reescritura<br/>de contenido]
        RENDER[Render de plantilla LaTeX]
        COMPILE[Compilación local<br/>tectonic/pdflatex]
    end

    subgraph CoverLetter["Carta de presentación"]
        CL_GEN[Generación de carta]
    end

    subgraph Salida["apps/{empresa}-{puesto}-{fecha}/"]
        OUT_CV[cv.pdf + cv.tex]
        OUT_CL[cover_letter.pdf/txt]
        OUT_META[metadata.json + job_description.txt]
    end

    EXT --> PROFILE
    SCHEMA -. valida .- PROFILE
    PROFILE <--> UI_EDIT
    UI_NEW -->|vacante + idioma| ANALYZE
    PROFILE --> TAILOR
    ANALYZE --> TAILOR --> RENDER --> COMPILE --> OUT_CV
    ANALYZE --> CL_GEN --> OUT_CL
    UI_NEW --> OUT_META
    OUT_CV --> UI_HIST
```

### Conectores con el modelo (API / Agente)

Ambos modos implementan la misma interfaz, de modo que el editor y el motor de generación no
necesitan saber cuál está activo:

```ts
interface ClaudeConnector {
  extractProfile(input: { pdfPath: string; imagePaths: string[] }): Promise<ProfileDraft>;
  analyzeJob(input: { jobDescription: string }): Promise<JobAnalysis>;
  tailorCV(input: { profile: Profile; jobAnalysis: JobAnalysis; language: "es" | "en" }): Promise<TailoredContent>;
  generateCoverLetter(input: { ... }): Promise<string>;
}
```

- **`web/lib/claude/api-connector.ts`**: llama al SDK de Anthropic desde el servidor de
  Next.js (la API key nunca se expone al cliente).
- **`web/lib/claude/agent-connector.ts`**: escribe la tarea en
  `.claude-tasks/pending/{task_id}.json`, espera (polling) el resultado en
  `.claude-tasks/done/{task_id}.result.json`, y reintenta el parseo del archivo unos
  segundos si lo encuentra a medio escribir antes de darlo por corrupto. `CLAUDE.md` en la
  raíz del repo documenta el contrato exacto de cada tipo de tarea para que Claude Code lo
  procese con el mismo criterio que el modo API (mismos prompts, en `web/lib/claude/prompts.ts`).
- **`npm run agent:watch`**: vigila el buzón y usa el CLI headless de Claude Code
  (`claude -p`) para resolver cada tarea automáticamente en cuanto aparece, sin que haya que
  pedirlo a mano cada vez.
- **`web/lib/claude/get-connector.ts`**: elige el conector activo según `CLAUDE_MODE` en
  `.env`, con posibilidad de override puntual desde la UI.
- **El modo Agente es exclusivo de instalaciones locales** (issue #16): solo tiene sentido
  contra un filesystem local (el buzón `.claude-tasks/` y `data/`/`apps/` que Claude Code lee
  y escribe). Cuando `STORAGE_MODE=hosted`, `resolveClaudeMode` en `get-connector.ts` fuerza
  siempre `"api"` — ignora `CLAUDE_MODE` y rechaza con `ClaudeConnectorError` cualquier
  `requestedMode="agent"` explícito, así que `AgentConnector` nunca puede instanciarse en una
  instancia hosteada. La UI (`/nueva-aplicacion`, `/perfil`) oculta el selector de modo Claude
  en ese caso leyendo `NEXT_PUBLIC_STORAGE_MODE` (espejo público de `STORAGE_MODE`, ver
  `.env.example`) — no hay forma de que un usuario final de la versión hosteada llegue a pedir
  modo Agente ni desde la UI ni desde la API.
- **Proveedor de modelo dentro del modo API** (`MODEL_PROVIDER`): `anthropic` (Anthropic,
  requiere créditos), `google` (Gemini/AI Studio — **recomendado**, free tier real sin
  tarjeta de crédito ni expiración, cubre `extractProfile` con el mismo proveedor que el
  resto de tareas porque es multimodal) o `nvidia` (build.nvidia.com, free tier permanente,
  catálogo de 100+ modelos open-weight vía API compatible con OpenAI — para
  `extractProfile` exige además `NVIDIA_NIM_VISION_MODEL`, porque a diferencia de los otros
  dos no soporta PDF nativo, solo imágenes). Los tres implementan el mismo `ClaudeConnector`
  (`api-connector.ts` / `gemini-connector.ts` / `nvidia-nim-connector.ts`).

### Persistencia hosteada (Supabase/Postgres)

Para la versión hosteada (en construcción, ver el [Project](https://github.com/users/Deivs117/projects/9)), `web/lib/db/schema.ts` define el schema en Drizzle ORM que reemplaza el filesystem (`data/profile.json`, `apps/{slug}/`) cuando `STORAGE_MODE=hosted` — modelo híbrido: columnas reales donde hay necesidad de filtrar/ordenar (`applications`, `jobs`), JSONB para el contenido anidado que siempre se carga completo (`profiles.data`, mismo shape que `profile.schema.json` hoy).

- **`profiles`**: un perfil por cuenta (`id` = `auth.uid()`, sin tabla intermedia).
- **`applications`**: una fila por aplicación generada, con `tailored_content` (JSONB) y las rutas (no URLs firmadas) de los PDFs en el bucket privado de Storage.
- **`jobs`**: cola de progreso del pipeline de generación en modo hosteado, reemplaza la cola en memoria de `web/lib/jobs.ts`.
- **RLS declarativo** (`pgPolicy` de `drizzle-orm/supabase`): cada usuario solo puede leer/escribir sus propias filas — el policy se genera junto con el `CREATE TABLE`, no aparte.
- **Drizzle Kit** (`make db-generate/db-migrate/db-push/db-studio`, o `npm run db:*` dentro de `web/`) gestiona las migraciones. `schemaFilter: ["public"]` en `drizzle.config.ts` evita que se intente recrear `auth.users` (ya lo gestiona Supabase Auth) — aun así, la primera migración generada necesitó un ajuste manual para quitar un `CREATE TABLE "auth"."users"` que `drizzle-kit` insertó de todas formas (issue conocida de la integración Drizzle+Supabase, documentada como comentario en la propia migración).
- **`web/lib/storage/supabase-storage.ts`**: bucket privado `generated-pdfs` (nunca público) para los PDFs generados. Sube/borra archivos y genera URLs firmadas de corta duración (5 min por defecto) con `SUPABASE_SECRET_KEY` — únicamente del lado del servidor, la URL firmada nunca se guarda en la base de datos (se genera al vuelo en cada request), solo la ruta dentro del bucket queda en `applications.cv_pdf_path`/`cover_letter_pdf_path`.
- **Autenticación con Google** (`/login`, `web/lib/supabase/{server,browser}.ts`, `web/proxy.ts`): login vía Supabase Auth + OAuth de Google, con `@supabase/ssr` (clientes separados para Server Components y Client Components) y `proxy.ts` refrescando la sesión en cada request — se llama `proxy.ts`, no `middleware.ts`, porque ese file convention quedó deprecado en Next.js 16. Al crearse una cuenta nueva, un trigger de Postgres (`drizzle/0001_create_profile_on_signup.sql`, `SECURITY DEFINER`) crea automáticamente su fila en `profiles` — la app nunca tiene que decidir "insertar o no".
- **Migración de datos locales** (`make migrate-local-data EMAIL=... [DRY_RUN=1]`, issue #12): script one-off que sube `data/profile.json` y cada carpeta de `apps/` (PDFs incluidos) a la cuenta hosteada de ese email — la cuenta debe existir ya (haber iniciado sesión con Google al menos una vez). Nunca se corre automáticamente en ningún deploy; los ids de las filas se derivan del email+slug de la carpeta, así que correrlo dos veces actualiza en vez de duplicar. Ya incluye `cvTex`/`coverLetterTex`/`coverLetterText`/`metadata` (columnas agregadas en #14, después de que este script se escribiera originalmente).
- **Backfill de `cvTex`/metadata** (`make backfill-cv-tex-metadata EMAIL=... [DRY_RUN=1]`, issue #92): script one-off para las aplicaciones que ya se habían migrado con `migrate-local-data` ANTES de que existieran esas columnas — sin esto, esas filas quedaban con el `.tex`/la metadata completa en `NULL` (verificado con una consulta real: las 51 aplicaciones migradas en #12, incluidas las 3 con carta en texto plano). Matchea por el mismo id determinístico que usa `migrate-local-data` (`scripts/lib/deterministic-id.ts`), nunca por company+role.
- **Cuotas de uso por cuenta** (`web/lib/usage-quota.ts`, tabla `usage_counters`, issue #18): en modo hosteado, una única key del proveedor de modelo paga por el uso de todos los usuarios, así que `checkAndIncrementUsage()` limita las generaciones por cuenta por día (`HOSTED_DAILY_GENERATION_LIMIT`, default 20). El upsert usa un `WHERE` condicional en el `ON CONFLICT` para incrementar y verificar el límite de forma atómica, sin una carrera entre leer y escribir. La tabla solo tiene policy de `SELECT` — el usuario puede ver su cuota restante, pero nunca escribirla directo (eso solo lo hace el servidor con la secret key). **Pendiente de conectar** en el punto real donde se llama al modelo, una vez exista una sesión de usuario autenticada en las rutas (#17).

### Plantillas y compilación LaTeX

- `templates/latex/cv-{es,en}.tex.tpl`: plantillas **ATS-safe** — una columna, sin tablas,
  iconos ni imágenes, tipografía estándar. `web/lib/latex/render.ts` las rellena escapando
  correctamente los caracteres especiales de LaTeX (`&`, `%`, `_`, `#`, `$`, etc.).
- `templates/latex/cv-visual.tex.tpl`: plantilla secundaria con foto, iconos y color, para
  enviar directo a un humano (**no ATS-safe**, no usar para aplicar por sistemas
  automatizados).
- `templates/latex/cover-letter-{es,en}.tex.tpl`: misma línea visual de una columna que el
  CV ATS-safe.
- `web/lib/latex/compile.ts` ejecuta `tectonic` (o `pdflatex` si `LATEX_ENGINE=pdflatex`) y
  guarda el log completo de compilación junto al PDF, tanto en éxito como en fallo.
- `web/lib/latex/page-count.ts` verifica el número real de páginas del PDF compilado con
  `pdf-lib`.

## Estructura del repositorio

```
update-cv/
├── data/
│   ├── raw/                    # CV fuente (PDF + imágenes) para la extracción inicial
│   ├── profile.json            # Perfil canónico (fuente de verdad)
│   ├── profile.draft.json      # Borrador de la última extracción, pendiente de revisión
│   └── profile.schema.json     # JSON Schema del perfil
├── apps/                       # Una carpeta por cada aplicación de empleo generada
│   └── {empresa}-{puesto}-{YYYYMMDD}/
│       ├── job_description.txt
│       ├── cv.tex / cv.pdf
│       ├── cover_letter.tex / .pdf / .txt   (si aplica)
│       └── metadata.json
├── templates/latex/             # Plantillas .tex.tpl ATS-safe y visual
├── web/                         # Aplicación Next.js
│   ├── app/                     # Rutas: /perfil, /nueva-aplicacion, /aplicaciones, /api/*
│   ├── components/
│   ├── lib/
│   │   ├── claude/               # Conectores API/Agente, prompts, contrato común
│   │   ├── latex/                 # render, compile, page-count
│   │   ├── validation/            # profile.zod.ts, generation.zod.ts
│   │   ├── tailoring.ts           # arma el contenido enviado a Claude y resuelve la
│   │   │                          # respuesta de vuelta contra el perfil real por id
│   │   ├── generation-pipeline.ts # orquesta analizar → adaptar → renderizar → compilar
│   │   ├── jobs.ts                # cola de jobs en memoria (generación no bloqueante)
│   │   └── experience-years.ts    # calcula años de experiencia para la recomendación de páginas
│   └── scripts/                  # extract-profile, test-latex-pipeline, agent-watch
├── .claude-tasks/                # Buzón de tareas del modo Agente (gitignored)
├── CLAUDE.md                     # Contrato de tareas para Claude Code en modo Agente
└── README.md
```

## Requisitos

- Node.js 20+ y npm (probado con Node 26 / npm 11).
- `tectonic` instalado en el sistema (compilador LaTeX). Alternativa: `pdflatex` (TeXLive).
  - Arch Linux: `sudo pacman -S tectonic` (o `paru -S tectonic-bin` desde AUR si el mirror
    falla).
  - Otras plataformas: https://tectonic-typesetting.github.io/en-US/install.html
- Una `ANTHROPIC_API_KEY` si vas a usar el modo API (no es necesaria si solo usas el modo
  Agente vía Claude Code). Se obtiene en https://console.anthropic.com/

## Arranque

Hay un `Makefile` en la raíz que envuelve los scripts de `web/package.json` como interfaz
única de comandos (`make help` lista todo). Es opcional: seguir usando `npm run <script>`
directo desde `web/` funciona exactamente igual si lo preferís.

```bash
git clone <este-repo>
cd update-cv

cp .env.example .env
# Edita .env y agrega tu ANTHROPIC_API_KEY si vas a usar modo API

make install
make dev
# http://localhost:3000

# Opcional: si vas a usar modo Agente (sin ANTHROPIC_API_KEY), en otra terminal,
# para que las tareas se procesen solas sin pedírselo a Claude Code cada vez:
make agent-watch
```

Equivalente sin `make`:

```bash
cd web
npm install
npm run dev
# en otra terminal, opcional:
npm run agent:watch
```

Otros comandos disponibles vía `make` (ver `make help`): `make build`, `make start`,
`make lint`, `make typecheck`, `make test` (suite de unit tests con Vitest, `#65`),
`make check` (lint + typecheck + test + build), `make extract-profile`, `make test-latex`.

`make test`/`npm test` (`web/`) es parte de las comprobaciones esperadas antes de mergear,
mismo estatus que `make check` — corre en cada PR/push vía CI (`.github/workflows/ci.yml`).
Cubre lógica pura (`get-connector.ts`, `extract-json-object.ts`, `escapeLatex` en
`render.ts`) y funciones con I/O real contra Supabase (`checkAndIncrementUsage`) mockeando
el cliente de la base — nunca contra un proyecto Supabase real, sin secrets en CI ni riesgo
de tocar datos reales. La integración real con Postgres/RLS sigue verificada manualmente,
como se hizo al construir `#7`/`#8`/`#10`.

### Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `CLAUDE_MODE` | `api` \| `agent` \| `both`. |
| `MODEL_PROVIDER` | Proveedor de modelo dentro del modo API: `anthropic` \| `google` (recomendado) \| `nvidia`. |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | Requeridas solo si `MODEL_PROVIDER=anthropic`. |
| `GOOGLE_API_KEY` / `GOOGLE_MODEL` | Requeridas solo si `MODEL_PROVIDER=google`. Gratis en [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `NVIDIA_NIM_API_KEY` / `NVIDIA_NIM_MODEL` / `NVIDIA_NIM_VISION_MODEL` | Requeridas solo si `MODEL_PROVIDER=nvidia` (la última, solo para `extractProfile`). Gratis en [build.nvidia.com](https://build.nvidia.com). |
| `DATABASE_URL` | Modo hosteado (`#7`-`#9`): conexión Postgres del proyecto Supabase, vía el connection pooler (ver nota de IPv6 en `.env.example`). |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Modo hosteado (`#10`): mismo proyecto, para Storage del lado del servidor (nunca expuesta al cliente). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Modo hosteado (`#11`): mismas credenciales que arriba pero seguras para el navegador — login con Google. |
| `DEFAULT_LANGUAGE` | `es` \| `en`. |
| `JUNIOR_EXPERIENCE_YEARS_THRESHOLD` | Años de experiencia bajo los cuales se recomienda 1 página. |
| `MAX_PAGES_SENIOR` | Máximo de páginas recomendado por encima del umbral anterior. |
| `LATEX_ENGINE` | `tectonic` \| `pdflatex`. |
| `AGENT_POLL_INTERVAL_MS` / `AGENT_TASK_TIMEOUT_MS` | Frecuencia de polling y timeout del modo Agente desde la web app. |
| `AGENT_WATCH_POLL_INTERVAL_MS` / `AGENT_WATCH_TASK_TIMEOUT_MS` / `AGENT_WATCH_CLAUDE_BIN` | Configuración del watcher (`npm run agent:watch`). |

## Contribuir

Los commits y los títulos de PR siguen [Conventional Commits](https://www.conventionalcommits.org/)
(`tipo(área): mensaje`), con `tipo` uno de: `feat, fix, chore, docs, refactor, test, style,
perf, ci`. Esto se valida de dos formas:

- **Localmente**, con un hook `commit-msg` de [pre-commit](https://pre-commit.com/)
  (`.pre-commit-config.yaml`, hook `conventional-pre-commit`). Instalación (una vez por
  clon):

  ```bash
  # Instala pre-commit si no lo tenés (elegí una):
  pipx install pre-commit
  # o
  uv tool install pre-commit

  # Dentro del repo:
  pre-commit install --hook-type commit-msg
  ```

- **En CI**, el workflow `.github/workflows/pr-title.yml` valida el título del PR con los
  mismos tipos permitidos — sirve de espejo para quien no tenga el hook instalado
  localmente.

## Usar tus propios datos

- `data/raw/` trae como semilla un CV de ejemplo solo para la demo inicial. Reemplaza su
  contenido (PDF + imágenes) con tu propio CV para usar el sistema con tus datos.
- `data/profile.json` es tu perfil canónico; se crea y edita desde `/perfil`, o a partir del
  borrador que genera la extracción inicial (`cd web && npm run extract-profile`, o el botón
  "Importar desde PDF/imágenes" dentro del editor).
- Nada del sistema está hardcodeado a un usuario específico: cualquiera que clone el repo
  puede llenar su propio perfil desde cero.

## Seguridad y privacidad

- El sistema corre localmente: no hay backend externo ni base de datos remota.
- `ANTHROPIC_API_KEY` solo se usa del lado del servidor (API routes de Next.js), nunca se
  expone al cliente.
- `.env` y `.claude-tasks/` están fuera de control de versiones. `apps/` también está
  gitignored por defecto, ya que cada aplicación generada guarda el texto completo de una
  vacante específica.
- `GET /api/apps/[...path]` (usado para previsualizar PDFs/`.tex` embebidos) está
  restringido a la carpeta `apps/`, sin permitir path traversal fuera de ella.
