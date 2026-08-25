# Instrucciones para Claude Code operando en modo Agente sobre `update-cv`

Este archivo es leído por Claude Code cuando el usuario lo invoca dentro de este repo para
procesar tareas del **modo Agente** (ver sección 7.3 y 16-Fase 6 de `ARQUITECTURA_update-cv.md`).

> Estado actual: el modo Agente (buzón `.claude-tasks/`) todavía no está implementado —
> esta sección se completa en la Fase 6 del roadmap. Por ahora, este archivo solo deja
> la convención documentada para cuando exista `agent-connector.ts`.

## Contrato del buzón de tareas (`.claude-tasks/`)

- `pending/{task_id}.json`: tareas escritas por la web app, pendientes de procesar.
- `done/{task_id}.result.json`: resultado que Claude Code debe escribir al terminar una tarea.

Tipos de tarea previstos:

| `type` | Entrada | Salida esperada |
|---|---|---|
| `extract_profile` | `input_pdf`, `input_images[]` | JSON que cumple `data/profile.schema.json` |
| `tailor_cv` | `profile`, `job_description`, `language` | `TailoredContent` (ver `web/lib/claude/connector.interface.ts`) |
| `generate_cover_letter` | `profile`, `job_description`, `language` | texto de la carta |

## Cuando el usuario pida "procesar tareas pendientes"

1. Lee todos los archivos en `.claude-tasks/pending/`.
2. Para cada uno, según su `type`, genera la salida correspondiente siguiendo el mismo
   prompt/criterio que usaría `api-connector.ts` para esa misma operación (revisa ese
   archivo para mantener paridad de comportamiento entre modo API y modo Agente).
3. Escribe el resultado en `output_path` (definido dentro de la propia tarea).
4. No borres el archivo de `pending/` — la web app lo mueve/limpia tras confirmar que leyó el resultado.

## Reglas generales

- Nunca sobrescribas `data/profile.json` directamente — solo el usuario, desde el editor
  web, confirma y persiste cambios al perfil.
- Todo texto generado en `es` o `en` debe respetar el idioma pedido en la tarea, sin mezclar.
- Sigue las reglas de la plantilla ATS-safe (sección 9.5 de `ARQUITECTURA_update-cv.md`):
  sin negritas excesivas, sin caracteres LaTeX sin escapar en el texto libre que generes.
