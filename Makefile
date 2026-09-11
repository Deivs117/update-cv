.PHONY: help install dev build start lint check extract-profile test-latex agent-watch

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
	@echo "  make check           - lint + build (typecheck se suma cuando exista el script)"
	@echo "  make extract-profile - Extraer un borrador de perfil desde data/raw/ (PDF/imagenes)"
	@echo "  make test-latex      - Probar el pipeline de render + compilacion LaTeX"
	@echo "  make agent-watch     - Vigilar .claude-tasks/ y resolver tareas del modo Agente"

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

# NOTA: web/package.json todavia no tiene un script "typecheck" (issue #4 en
# curso). En cuanto exista, sumarlo aqui como
#   cd $(WEB_DIR) && npm run typecheck
# antes del build, para que "make check" sea lint + typecheck + build.
check: lint build
	@echo "lint + build: todo en orden (typecheck pendiente de que exista el script, ver issue #4)."

# ============================================
# MODO AGENTE Y HERRAMIENTAS DEL PERFIL
# ============================================

extract-profile:
	@echo "Extrayendo borrador de perfil desde data/raw/..."
	cd $(WEB_DIR) && npm run extract-profile

test-latex:
	@echo "Probando el pipeline de render + compilacion LaTeX..."
	cd $(WEB_DIR) && npm run test-latex

agent-watch:
	@echo "Vigilando .claude-tasks/ para resolver tareas del modo Agente..."
	cd $(WEB_DIR) && npm run agent:watch
