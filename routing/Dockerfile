FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Once veri uret, sonra modeli egit.
CMD ["sh", "-c", "python data_generator.py && python train_model.py"]
