# update-cv

Sistema **100% local** para generar CVs a la medida de cada vacante de empleo, a partir de
un perfil canónico (`data/profile.json`), plantillas LaTeX ATS-safe y compilación local a PDF.

Ver `ARQUITECTURA_update-cv.md` para la especificación completa del sistema.

> Este README se va completando fase por fase (ver roadmap en la sección 16 de
> `ARQUITECTURA_update-cv.md`). Lo que sigue documenta el estado real del repo hoy.

## Estado del proyecto

- [x] Fase 0 — Setup
- [ ] Fase 1 — Extracción (demo)
- [ ] Fase 2 — Interfaz de perfil
- [ ] Fase 3 — Plantillas y compilación
- [ ] Fase 4 — Motor de generación a medida
- [ ] Fase 5 — Carta de presentación
- [ ] Fase 6 — Modo Agente
- [ ] Fase 7 — Pulido

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
