.PHONY: help install dev build start lint typecheck test check extract-profile migrate-local-data backfill-cv-tex-metadata test-latex agent-watch db-generate db-migrate db-push db-studio

# Deteccion de SO
ifeq ($(OS),Windows_NT)
	RM_DIR := rmdir /s /q
else
	RM_DIR := rm -rf
endif

# Todo el codigo de la app vive en web/ (Next.js). Este Makefile es solo una
# interfaz que envuelve los scripts npm ya definidos en web/package.json, para
# tener un unico punto de entrada de comandos en la raiz del repo (util de cara
# a cuando el repo pase a tener mas de un lenguaje/paquete).
WEB_DIR := web

# ============================================
# AYUDA
# ============================================

help:
	@echo "Comandos disponibles:"
	@echo "  make install         - Instalar dependencias del frontend (cd web && npm install)"
	@echo "  make dev             - Levantar el servidor de desarrollo (next dev)"
	@echo "  make build           - Compilar la app para produccion (next build)"
	@echo "  make start           - Levantar la app ya compilada (next start)"
	@echo "  make lint            - Revisar estilo de codigo con eslint"
	@echo "  make typecheck       - Revisar tipos con tsc"
	@echo "  make test            - Correr la suite de tests (Vitest)"
	@echo "  make check           - lint + typecheck + test + build"
	@echo "  make extract-profile - Extraer un borrador de perfil desde data/raw/ (PDF/imagenes)"
	@echo "  make migrate-local-data EMAIL=... [DRY_RUN=1]"
	@echo "                                              - Subir profile.json y apps/ a una cuenta hosteada (issue #12)"
	@echo "  make backfill-cv-tex-metadata EMAIL=... [DRY_RUN=1]"
	@echo "                                              - Rellenar cvTex/coverLetterTex/coverLetterText/metadata en aplicaciones ya migradas (issue #92)"
	@echo "  make test-latex      - Probar el pipeline de render + compilacion LaTeX"
	@echo "  make agent-watch     - Vigilar .claude-tasks/ y resolver tareas del modo Agente"
	@echo "  make db-generate     - Generar una migracion SQL desde lib/db/schema.ts (sin DB real)"
	@echo "  make db-migrate      - Aplicar migraciones pendientes (requiere DATABASE_URL)"
	@echo "  make db-push         - Aplicar el schema directo, sin migracion versionada (solo dev/preview)"
	@echo "  make db-studio       - Abrir Drizzle Studio contra DATABASE_URL"

# ============================================
# INSTALACION Y DEPENDENCIAS
# ============================================

install:
	@echo "Instalando dependencias del frontend con npm..."
	cd $(WEB_DIR) && npm install

# ============================================
# DESARROLLO
# ============================================

dev:
	@echo "Levantando servidor de desarrollo (next dev)..."
	cd $(WEB_DIR) && npm run dev

build:
	@echo "Compilando la app para produccion (next build)..."
	cd $(WEB_DIR) && npm run build

start:
	@echo "Levantando la app ya compilada (next start)..."
	cd $(WEB_DIR) && npm run start

# ============================================
# CALIDAD DE CODIGO
# ============================================

lint:
	@echo "Revisando estilo de codigo con eslint..."
	cd $(WEB_DIR) && npm run lint

typecheck:
	@echo "Revisando tipos con tsc..."
	cd $(WEB_DIR) && npm run typecheck

test:
	@echo "Corriendo la suite de tests (Vitest)..."
	cd $(WEB_DIR) && npm test

check: lint typecheck test build
	@echo "lint + typecheck + test + build: todo en orden."

# ============================================
# MODO AGENTE Y HERRAMIENTAS DEL PERFIL
# ============================================

extract-profile:
	@echo "Extrayendo borrador de perfil desde data/raw/..."
	cd $(WEB_DIR) && npm run extract-profile

migrate-local-data:
	@echo "Migrando data/profile.json y apps/ a la cuenta $(EMAIL) (issue #12)..."
ifdef DRY_RUN
	cd $(WEB_DIR) && npm run migrate-local-data -- --email $(EMAIL) --dry-run
else
	cd $(WEB_DIR) && npm run migrate-local-data -- --email $(EMAIL)
endif

backfill-cv-tex-metadata:
	@echo "Rellenando cvTex/coverLetterTex/coverLetterText/metadata para $(EMAIL) (issue #92)..."
ifdef DRY_RUN
	cd $(WEB_DIR) && npm run backfill-cv-tex-metadata -- --email $(EMAIL) --dry-run
else
	cd $(WEB_DIR) && npm run backfill-cv-tex-metadata -- --email $(EMAIL)
endif

test-latex:
	@echo "Probando el pipeline de render + compilacion LaTeX..."
	cd $(WEB_DIR) && npm run test-latex

agent-watch:
	@echo "Vigilando .claude-tasks/ para resolver tareas del modo Agente..."
	cd $(WEB_DIR) && npm run agent:watch

# ============================================
# BASE DE DATOS (Supabase/Postgres, modo hosteado -- issue #8/#9)
# ============================================
# db-migrate/db-push/db-studio requieren DATABASE_URL en el entorno -- ver
# lib/db/client.ts y la sección "Gestión de secretos" de CLAUDE.md (nunca
# copiada a mano, se pide a la CLI de Supabase ya autenticada).

db-generate:
	@echo "Generando migracion SQL desde lib/db/schema.ts..."
	cd $(WEB_DIR) && npm run db:generate

db-migrate:
	@echo "Aplicando migraciones pendientes..."
	cd $(WEB_DIR) && npm run db:migrate

db-push:
	@echo "Aplicando el schema directo (sin migracion versionada, solo dev/preview)..."
	cd $(WEB_DIR) && npm run db:push

db-studio:
	@echo "Abriendo Drizzle Studio..."
	cd $(WEB_DIR) && npm run db:studio
