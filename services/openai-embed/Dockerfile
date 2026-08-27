FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask openai gunicorn

COPY app.py .

ENV PORT=8080
EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "app:app"]
