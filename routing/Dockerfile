FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Port
EXPOSE 5050

# Model dosyası volume'dan geliyorsa eğitimi atla, yoksa eğit.
# serve.py startup'ta ensure_model() çağırır.
CMD ["python", "serve.py"]
