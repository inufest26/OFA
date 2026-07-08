# Payment Routing Hackathon Demo

Bu proje sentetik odeme routing verisi uretir, anomali enjekte eder ve bir siniflandirma modeli egitir.

## Kurulum ve Calistirma

1. Image'i build et:

```bash
docker build -t cezeri-routing .
```

2. Container'i calistir ve ciktilari host tarafinda da gormek icin klasoru mount et:

PowerShell icin:

```bash
docker run --rm -v ${PWD}:/app cezeri-routing
```

3. Calisma sonunda su dosyalar olusur:

`data/transactions.csv`

`models/routing_model.pkl`

## Ciktiyi Kontrol Etme

1. Veri uretim logunda satir sayisi ve sinif dagilimi yazdirilir.
2. Egitim logunda accuracy, precision, recall, F1-score ve ROC-AUC gorunur.
3. CSV satir sayisini hostta kontrol etmek icin:

```bash
python -c "import pandas as pd; df = pd.read_csv('data/transactions.csv'); print(len(df)); print(df['success'].value_counts()); print(df['success'].value_counts(normalize=True).sort_index())"
```

4. Model dosyasinin olustugunu kontrol etmek icin `models/routing_model.pkl` dosyasina bak.

## Not

`anomaly.py` icindeki `inject_anomaly(...)` fonksiyonu veri uretiminde ve canli/demo simulasiyonunda ortak olarak import edilmek icin tek merkezde tutulur.
