# syntax=docker/dockerfile:1.7
#
# The Python RAG service (FastAPI + LangChain + Chroma).
#
# Ollama is NOT in this image — it stays on the host with your pulled models
# (bge-m3, llama3.1:8b) and is reached via OLLAMA_BASE_URL. Baking a model
# server with multi-GB weights into a service image would be the wrong trade.

FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# tesseract  — pytesseract shells out to this binary for image OCR
# libmagic1   — unstructured sniffs file types with it
# curl        — healthcheck probe
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libmagic1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ---------- deps ----------------------------------------------------------
FROM base AS deps
COPY requirements.txt .
# Cache mount keeps the wheels between builds — chromadb and its onnxruntime
# dependency are large enough that re-downloading them hurts.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

# ---------- runtime -------------------------------------------------------
FROM base AS runtime
COPY --from=deps /install /usr/local
COPY . .

# config.py creates these at import time, but they are volume mount points and
# must exist and be writable by the non-root user first.
RUN useradd --create-home --uid 1000 rag \
    && mkdir -p data/documents data/chroma data/images \
    && chown -R rag:rag /app
USER rag

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
