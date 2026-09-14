# Instrucciones para Claude Code sobre `update-cv`

Este archivo solo trae reglas **universales** — necesarias en cualquier sesión, sin
importar en qué parte del repo se esté trabajando. Se sube completo en cada request, así
que cualquier cosa específica de un área (frontend, backend, o el contrato de una
funcionalidad puntual del producto) vive en una Skill aparte (`.claude/skills/`), que
Claude Code carga solo cuando de verdad aplica — no en cada turno.

## Skills de este repo

- **`.claude/skills/modo-agente/`** — **committeada** (no en `.gitignore`): el contrato
  completo del Modo Agente (buzón `.claude-tasks/`) es funcionalidad del producto
  `update-cv` (ver "Conectores con el modelo (API / Agente)" en el `README.md`) — cualquiera
  que clone el repo y quiera usar el sistema sin `ANTHROPIC_API_KEY` necesita que esta skill
  exista, no es una preferencia personal del mantenedor.
- **Cualquier otra skill** (frontend, backend, diseño — instaladas bajo demanda, ej. vía
  `/plugin`) vive también en `.claude/skills/`, pero **gitignoreada por defecto**: son
  herramientas de trabajo de quien esté desarrollando, no documentación que el proyecto
  necesite versionar (mismo criterio que `PruebasCorteGrabadoLaser`). `.gitignore` excluye
  `.claude/skills/*` salvo `modo-agente/`, explícitamente.

Esta sección de arriba y las que siguen (orquestación del backlog, nunca nada deprecado,
flujo de ramas/worktrees/Kanban, gestión de secretos) sí son universales y se quedan acá.

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

## Nunca dejar nada deprecado

Ninguna dependencia, versión de lenguaje/runtime, acción de CI, API o función usada en este
repo puede quedar en una versión marcada como deprecada — ni "todavía funciona, ya se
arreglará después". Antes de fijar una versión en cualquier config nueva (CI, `package.json`,
runtime, etc.), verificar cuál es la versión activa/soportada vigente (no asumir de memoria
— las ventanas de soporte cambian; confirmar contra la fuente oficial del proyecto en
cuestión). Si una dependencia ya en uso pasa a estar deprecada, es motivo suficiente para un
ticket de actualización, no algo que esperar a que rompa.

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

### Gestión de secretos: CLI autenticada, nunca copiados a mano

Cuando el proyecto tenga entornos hosteados (Vercel/Supabase, ver `feature/data` y
`feature/deploy` en el Project), las credenciales de cada entorno **nunca se guardan en el
repo** — ni en texto plano ni cifradas, ni siquiera en uno privado. La clave para descifrar
un secreto cifrado en git es en sí misma un secreto que hay que gestionar aparte, así que
esa vía no elimina el problema, solo lo mueve.

El patrón correcto es autenticar la CLI de cada plataforma **una sola vez por máquina**
(el token queda fuera del repo, en la config local de la CLI), y pedirle a la CLI ya
autenticada las credenciales vigentes de cualquier entorno cuando hagan falta — nunca
copiarlas a mano desde un dashboard:

```
# Una vez por máquina:
vercel login
supabase login

# Cuando haga falta un entorno específico, sin volver a pegar nada:
vercel env pull --environment=development .env.local
vercel env pull --environment=preview .env.preview
vercel env pull --environment=production .env.production.local

supabase link --project-ref <ref-dev-preview>   # o <ref-produccion>, aparte
```

**Política de confirmación en producción:** que la CLI esté autenticada no significa que
cualquier sesión (agéntica o no) pueda tocar producción sin más. Antes de correr una
migración, un `db push`, o cualquier cambio contra el proyecto Supabase/Vercel de
**producción**, hay que pedir confirmación explícita al usuario en el momento — nunca
asumir que la autenticación local ya es suficiente autorización para ese cambio puntual.
Esto aplica aunque el comando sea técnicamente idéntico al que ya se corrió sin pedir
permiso contra dev/preview.

`.env.example` documentará qué variables vienen de cada entorno (dev/preview vs.
producción) a medida que existan — eso se agrega junto con los tickets de `feature/data`
que provisionan Supabase (#7) y Vercel (#20), no acá: documentar variables que todavía no
existen sería más confuso que útil.

---

## Modo Agente (funcionalidad del producto)

Contrato completo en la skill `.claude/skills/modo-agente/SKILL.md` — se carga solo cuando
el usuario pide explícitamente procesar tareas pendientes del buzón `.claude-tasks/`, no en
cada sesión.

Es una funcionalidad **exclusiva de instalaciones locales** (`STORAGE_MODE=local`): en
`STORAGE_MODE=hosted`, `resolveClaudeMode` (`web/lib/claude/get-connector.ts`) fuerza modo
API sin excepción y la UI oculta el selector — nunca queda disponible ni configurable en la
versión hosteada (issue #16).
