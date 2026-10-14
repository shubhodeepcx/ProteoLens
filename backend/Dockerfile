FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Uploaded structures and the SQLite summary table live here; mount a volume
# on it to keep them across container restarts.
RUN mkdir -p /app/storage/proteins
ENV PROTEOLENS_DB=/app/storage/proteolens.db

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
