SHELL := /bin/bash

ROOT := $(shell pwd)
PYTHON ?= python3
VENV := $(ROOT)/.venv
NODE_DIR := viewer

.PHONY: install backend desktop

install:
	@echo "Preparing Python virtual environment in $(VENV)..."
	@if [ ! -d "$(VENV)" ]; then $(PYTHON) -m venv $(VENV); fi
	@$(VENV)/bin/python -m pip install --upgrade pip
	@$(VENV)/bin/python -m pip install -r requirements.txt
	@if command -v npm >/dev/null 2>&1; then \
		echo "Installing frontend dependencies via npm..."; \
		cd $(NODE_DIR) && npm install; \
	else \
		echo "npm not found; skipping viewer dependencies"; \
	fi

backend:
	@if [ ! -x "$(VENV)/bin/uvicorn" ]; then \
		echo "Backend dependencies missing. Run 'make install' first."; \
		exit 1; \
	fi
	@PYTHONPATH="$(ROOT):$(ROOT)/backend" VIEWER_API_PROXY_URL=http://127.0.0.1:8002 $(VENV)/bin/uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8002

desktop:
	@if [ ! -x "$(VENV)/bin/python" ]; then \
		echo "Python environment missing. Run 'make install' first."; \
		exit 1; \
	fi
	@PYTHONPATH="$(ROOT)" VIEWER_API_PROXY_URL=http://127.0.0.1:8002 $(VENV)/bin/python main.py --viewer-port 8001

.PHONY: seed-catalog
seed-catalog:
	@PYTHONPATH="$(ROOT):$(ROOT)/backend" $(VENV)/bin/python backend/scripts/seed_catalog.py
