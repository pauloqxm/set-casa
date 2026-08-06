FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8765
ENV COOKIE_SECURE=1

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY server.py db.py storage.py import_xlsx.py ./
COPY web/ ./web/

EXPOSE 8765

CMD ["sh", "-c", "python -u server.py"]
