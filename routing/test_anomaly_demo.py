"""Anomali oncesi ve sonrasi routing kaymasini gosteren demo scripti."""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd

from anomaly import get_anomaly_multiplier, inject_anomaly, reset_anomalies


MODEL_PATH = Path("models") / "routing_model.pkl"
ACQUIRERS = [f"A{i:02d}" for i in range(1, 6)]


def load_model():
    """Egitilmis pipeline modelini yukler."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError("models/routing_model.pkl bulunamadi. Once train_model.py calistirilmali.")
    return joblib.load(MODEL_PATH)


def build_scenarios() -> pd.DataFrame:
    """Tek bir islem profilinden birkac ornek olusturur."""
    # Sabit bir islem profili tanimliyoruz; sadece acquirer degisecek.
    base_rows = []
    base_timestamp = pd.Timestamp("2025-03-20 02:15:00")

    for i in range(5):
        base_rows.append(
            {
                "issuer_id": "I03",
                "card_type": "credit",
                "amount": 185.0 + i * 15.0,
                "hour_of_day": base_timestamp.hour,
                "day_of_week": base_timestamp.dayofweek,
                "is_retry": 1 if i % 2 == 0 else 0,
                "timestamp": base_timestamp + pd.Timedelta(minutes=i * 3),
            }
        )

    return pd.DataFrame(base_rows)


def score_acquirers(model, scenario_row: pd.Series, anomaly_enabled: bool) -> pd.DataFrame:
    """Tum acquirer'lar icin beklenen basari skorunu hesaplar."""
    rows = []

    for acquirer_id in ACQUIRERS:
        # Modelin bekledigi feature setini hazirliyoruz.
        sample = pd.DataFrame(
            [
                {
                    "acquirer_id": acquirer_id,
                    "issuer_id": scenario_row["issuer_id"],
                    "card_type": scenario_row["card_type"],
                    "amount": scenario_row["amount"],
                    "hour_of_day": scenario_row["hour_of_day"],
                    "day_of_week": scenario_row["day_of_week"],
                    "is_retry": scenario_row["is_retry"],
                }
            ]
        )

        # Modelin success olasiligini aliyoruz.
        success_probability = float(model.predict_proba(sample)[0, 1])

        # Canli/demo senaryosunda anomali bu skorun uzerine carpim etkisi yapar.
        anomaly_multiplier = 1.0
        if anomaly_enabled:
            anomaly_multiplier = get_anomaly_multiplier(acquirer_id, scenario_row["timestamp"])

        effective_score = success_probability * anomaly_multiplier

        rows.append(
            {
                "acquirer_id": acquirer_id,
                "model_success_prob": success_probability,
                "anomaly_multiplier": anomaly_multiplier,
                "effective_score": effective_score,
            }
        )

    return pd.DataFrame(rows).sort_values("effective_score", ascending=False).reset_index(drop=True)


def print_table(title: str, table_df: pd.DataFrame) -> None:
    """Okunakli bir tablo basar."""
    print(f"\n{title}")
    print("-" * len(title))
    print(f"{'Rank':<5} {'Acquirer':<10} {'Model P(success)':<18} {'Anomaly x':<10} {'Effective score':<16}")
    for rank, row in enumerate(table_df.itertuples(index=False), start=1):
        print(
            f"{rank:<5} {row.acquirer_id:<10} {row.model_success_prob:<18.4f} {row.anomaly_multiplier:<10.3f} {row.effective_score:<16.4f}"
        )


def main() -> None:
    """Anomali oncesi ve sonrasi routing secimini karsilastirir."""
    model = load_model()
    scenarios = build_scenarios()

    print("Test anomaly demo basladi.")
    print("Sabit islem profili icin birkac ornek uretiliyor ve tum acquirer'lar degerlendiriliyor.")

    # Once temiz durumdayiz; anomali kurali yok.
    reset_anomalies()

    before_tables = []
    before_best = []

    for idx, scenario_row in scenarios.iterrows():
        scored = score_acquirers(model, scenario_row, anomaly_enabled=False)
        before_tables.append(scored)
        before_best.append(scored.iloc[0]["acquirer_id"])

    # En iyi bulunan acquirer'ı bozuk duruma getiriyoruz.
    target_acquirer = before_best[0]
    inject_anomaly(
        acquirer_id=target_acquirer,
        start_time="2025-03-20 00:00:00",
        end_time="2025-03-20 23:59:59",
        severity=0.9,
    )

    after_tables = []
    after_best = []

    for idx, scenario_row in scenarios.iterrows():
        scored = score_acquirers(model, scenario_row, anomaly_enabled=True)
        after_tables.append(scored)
        after_best.append(scored.iloc[0]["acquirer_id"])

    # Öncesi / sonrası karşılaştırmasını kompakt bir özet tablo halinde yazdır.
    comparison = pd.DataFrame(
        {
            "sample": [f"S{i+1}" for i in range(len(scenarios))],
            "best_before": before_best,
            "best_after": after_best,
            "changed": ["yes" if a != b else "no" for a, b in zip(before_best, after_best)],
        }
    )

    print("\nOncesi / sonrasi ozet")
    print("-" * 22)
    print(comparison.to_string(index=False))

    # Ilk senaryo icin tabloyu detayli basarak farki gosteriyoruz.
    print_table("\nAnomali oncesi skor tablosu - S1", before_tables[0])
    print_table("\nAnomali sonrasi skor tablosu - S1", after_tables[0])

    print(
        f"\nBozulan acquirer: {target_acquirer} | Oncesi en iyi: {before_best[0]} | Sonrasi en iyi: {after_best[0]}"
    )


if __name__ == "__main__":
    main()
