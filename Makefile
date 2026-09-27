.PHONY: install test run migrate

install:
	cd backend && uv sync

test:
	cd backend && uv run pytest

run:
	cd backend && uv run uvicorn app.main:app --reload

migrate:
	cd backend && uv run alembic upgrade head
