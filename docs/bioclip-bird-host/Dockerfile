FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BIOCLIP_CACHE_DIR=/data \
    BIOCLIP_DEVICE=auto

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY app.py ./

RUN useradd --create-home --uid 10001 naturelens \
    && mkdir --parents /data \
    && chown --recursive naturelens:naturelens /data /app

USER naturelens
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20m --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=4)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers", "--no-server-header"]
