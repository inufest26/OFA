"""Sentetik odeme routing verisi uretir ve CSV olarak kaydeder."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from anomaly import get_anomaly_multiplier, inject_anomaly, reset_anomalies


SEED = 42
N_ROWS = 80_000

ACQUIRER_IDS = [f"A{i:02d}" for i in range(1, 6)]
ISSUER_IDS = [f"I{i:02d}" for i in range(1, 9)]
CARD_TYPES = ["debit", "credit", "prepaid"]


def build_base_probability_matrix(rng: np.random.Generator) -> np.ndarray:
    """Acquirer / issuer / card kombinasyonlari icin temel basari matrisi uretir."""
    # Olasiliklari ust banda yakin tutuyoruz ki genel basarisizlik orani gercekci kalsin.
    raw = rng.beta(12, 2, size=(len(ACQUIRER_IDS), len(ISSUER_IDS), len(CARD_TYPES)))
    return 0.85 + raw * (0.99 - 0.85)


def generate_transactions() -> pd.DataFrame:
    """Tum sentetik islemleri tek tablo halinde uretir."""
    rng = np.random.default_rng(SEED)
    reset_anomalies()

    # Veri icin tek bir hedef anomali penceresi ekliyoruz.
    inject_anomaly(
        acquirer_id="A03",
        start_time="2025-03-18 00:00:00",
        end_time="2025-03-24 23:59:59",
        severity=0.70,
    )

    base_matrix = build_base_probability_matrix(rng)
    timestamp_start = pd.Timestamp("2025-01-01 00:00:00")
    timestamp_span_minutes = 180 * 24 * 60

    # Kategorik alanlari toplu sekilde sec.
    acquirer_idx = rng.integers(0, len(ACQUIRER_IDS), size=N_ROWS)
    issuer_idx = rng.integers(0, len(ISSUER_IDS), size=N_ROWS)
    card_idx = rng.integers(0, len(CARD_TYPES), size=N_ROWS)
    is_retry = rng.binomial(1, 0.08, size=N_ROWS)

    # Tutar dagilimi hafif kuyruklu olsun.
    amount = rng.lognormal(mean=3.35, sigma=0.85, size=N_ROWS)
    amount = np.clip(amount, 1.0, 5000.0)

    # Gun icindeki saat ve haftanin gunu sinyali ekle.
    timestamp_offsets = rng.integers(0, timestamp_span_minutes, size=N_ROWS)
    timestamps = timestamp_start + pd.to_timedelta(timestamp_offsets, unit="m")
    hour_of_day = pd.DatetimeIndex(timestamps).hour.to_numpy()
    day_of_week = pd.DatetimeIndex(timestamps).dayofweek.to_numpy()

    # Temel olasiligi kombinasyon matrisinden oku.
    base_probability = base_matrix[acquirer_idx, issuer_idx, card_idx]

    # Buyuk tutarlar biraz daha riskli olsun.
    amount_penalty = np.clip(np.log1p(amount) / np.log1p(5000.0) * 0.023, 0.0, 0.023)

    # Gece saatlerinde hafif dusus olsun.
    hour_penalty = np.where(hour_of_day <= 5, 0.015, np.where(hour_of_day <= 8, 0.007, 0.0))

    # Haftasonlari cok hafif daha riskli.
    day_penalty = np.where(day_of_week >= 5, 0.003, 0.0)

    # Retry islemleri biraz daha riskli olsun.
    retry_penalty = is_retry * 0.018

    # Anomali penceresini satir bazinda uygula.
    anomaly_multiplier = np.ones(N_ROWS, dtype=float)
    for i in range(N_ROWS):
        anomaly_multiplier[i] = get_anomaly_multiplier(ACQUIRER_IDS[acquirer_idx[i]], timestamps[i])

    # Nihai basari olasiligini hesapla ve mantikli aralikta tut.
    success_probability = base_probability - amount_penalty - hour_penalty - day_penalty - retry_penalty
    success_probability = success_probability * anomaly_multiplier
    success_probability = np.clip(success_probability, 0.01, 0.995)

    # Binomial ile 0/1 etiketini uretiyoruz.
    success = rng.binomial(1, success_probability)

    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(timestamps),
            "acquirer_id": [ACQUIRER_IDS[i] for i in acquirer_idx],
            "issuer_id": [ISSUER_IDS[i] for i in issuer_idx],
            "card_type": [CARD_TYPES[i] for i in card_idx],
            "amount": np.round(amount, 2),
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "is_retry": is_retry,
            "success": success,
        }
    )

    return df


def main() -> None:
    """CSV dosyasini olusturur ve ozeti ekrana yazar."""
    output_path = Path("data") / "transactions.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    df = generate_transactions()
    df.to_csv(output_path, index=False)

    failure_rate = (df["success"] == 0).mean() * 100
    print(f"Uretilen satir sayisi: {len(df):,}")
    print(f"Basarisiz islem orani: {failure_rate:.2f}%")
    print("Sinif dagilimi:")
    print(df["success"].value_counts().sort_index())
    print(f"CSV kaydedildi: {output_path}")


if __name__ == "__main__":
    main()
