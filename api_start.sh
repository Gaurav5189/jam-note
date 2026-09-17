#!/bin/bash
exec uv run --directory apps/fastapi-backend fastapi dev src/fastapi_backend/main.py --host 0.0.0.0