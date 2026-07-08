"""
ML Routing Model — FastAPI Serve

Startup:
  1. Eğer model dosyası yoksa veri üret ve modeli eğit.
  2. Modeli belleğe yükle.
  3. POST /predict endpoint'ini sun.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── Paths ──────────────────────────────────────────────────────────────────────
MODEL_PATH = Path("models/routing_model.pkl")
DATA_PATH  = Path("data/transactions.csv")

# ── Acquirer ID mapping ────────────────────────────────────────────────────────
# JS sistemdeki acquirer ID → modelin eğitildiği ID
ACQUIRER_MAP = {
    "acquirer_garanti":   "A01",
    "acquirer_yapikredi": "A02",
    "acquirer_isbank":    "A03",
}
REVERSE_MAP = {v: k for k, v in ACQUIRER_MAP.items()}

# Model eğitiminde kullanılan tüm acquirer ID'leri
ALL_TRAINING_ACQUIRERS = [f"A{i:02d}" for i in range(1, 6)]

# ── Card type normalisation ────────────────────────────────────────────────────
CARD_TYPE_MAP = {
    "visa":       "credit",
    "mastercard": "credit",
    "troy":       "debit",
    "credit":     "credit",
    "debit":      "debit",
    "prepaid":    "prepaid",
}

# ── Pipeline ───────────────────────────────────────────────────────────────────
pipeline = None


def ensure_model() -> None:
    """Model yoksa veri üret ve eğit."""
    if MODEL_PATH.exists():
        print("[serve] Model mevcut, eğitim atlanıyor.", flush=True)
        return

    print("[serve] Model bulunamadı — veri üretiliyor...", flush=True)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "data_generator.py"], check=True)

    print("[serve] Model eğitiliyor...", flush=True)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "train_model.py"], check=True)

    print("[serve] Eğitim tamamlandı.", flush=True)


# ── FastAPI ────────────────────────────────────────────────────────────────────
app = FastAPI(title="SmartPay ML Router", version="1.0.0")


@app.on_event("startup")
async def startup_event():
    global pipeline
    ensure_model()
    pipeline = joblib.load(MODEL_PATH)
    print(f"[serve] Model yüklendi: {MODEL_PATH}", flush=True)


# ── Schemas ────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    acquirer_ids: List[str]          # JS acquirer ID'leri
    card_type: str = "credit"        # visa / mastercard / troy / credit / debit / prepaid
    amount: float = 100.0
    hour_of_day: int = 12            # 0-23
    day_of_week: int = 1             # 0 (Pzt) – 6 (Paz)
    is_retry: int = 0                # 0 veya 1
    issuer_id: str = "I01"           # varsayılan issuer


class PredictResponse(BaseModel):
    scores: Dict[str, float]
    selected_acquirer: str
    confidence: float
    method: str = "ml-random-forest"


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": pipeline is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi.")

    card_type_norm = CARD_TYPE_MAP.get(req.card_type.lower(), "credit")
    scores: Dict[str, float] = {}

    for js_acq_id in req.acquirer_ids:
        model_acq_id = ACQUIRER_MAP.get(js_acq_id)
        if model_acq_id is None:
            # Bilinmeyen acquirer → sıfır skor
            scores[js_acq_id] = 0.0
            continue

        row = pd.DataFrame([{
            "acquirer_id": model_acq_id,
            "issuer_id":   req.issuer_id,
            "card_type":   card_type_norm,
            "amount":      float(req.amount),
            "hour_of_day": int(req.hour_of_day),
            "day_of_week": int(req.day_of_week),
            "is_retry":    int(req.is_retry),
        }])

        # predict_proba → [prob_fail, prob_success]
        proba = pipeline.predict_proba(row)[0]
        success_prob = float(proba[1])
        scores[js_acq_id] = round(success_prob, 4)

    if not scores:
        raise HTTPException(status_code=400, detail="Geçerli acquirer ID bulunamadı.")

    selected = max(scores, key=lambda k: scores[k])
    return PredictResponse(
        scores=scores,
        selected_acquirer=selected,
        confidence=scores[selected],
    )


# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("ROUTING_PORT", 5050))
    uvicorn.run("serve:app", host="0.0.0.0", port=port, log_level="info")
