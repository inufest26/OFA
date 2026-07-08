"""Routing modelini egitir, degerlendirir ve diske kaydeder."""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


FEATURE_COLUMNS = ["acquirer_id", "issuer_id", "card_type", "amount", "hour_of_day", "day_of_week", "is_retry"]
TARGET_COLUMN = "success"


def load_data() -> pd.DataFrame:
    """Uretilen CSV dosyasini okur."""
    data_path = Path("data") / "transactions.csv"
    if not data_path.exists():
        raise FileNotFoundError("data/transactions.csv bulunamadi. Once data_generator.py calistirilmali.")
    return pd.read_csv(data_path)


def build_pipeline() -> Pipeline:
    """Kategorik alanlari encode eden egitim pipeline'ini kurar."""
    categorical_features = ["acquirer_id", "issuer_id", "card_type"]
    numeric_features = ["amount", "hour_of_day", "day_of_week", "is_retry"]

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical_features),
            ("num", "passthrough", numeric_features),
        ]
    )

    # Sinif dengesizligi icin balanced agirlik kullaniyoruz.
    model = RandomForestClassifier(
        n_estimators=180,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
        min_samples_leaf=3,
    )

    return Pipeline([
        ("preprocess", preprocessor),
        ("model", model),
    ])


def main() -> None:
    """Modeli egitir, metrikleri yazdirir ve pickle olarak kaydeder."""
    df = load_data()

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    # Train/test ayrimi sinif dagilimini korusun.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)

    # Odak metrikleri failure sinifi (0) icin raporluyoruz.
    failure_probability = y_prob[:, 0]
    failure_true = (y_test == 0).astype(int)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, pos_label=0)
    recall = recall_score(y_test, y_pred, pos_label=0)
    f1 = f1_score(y_test, y_pred, pos_label=0)
    roc_auc = roc_auc_score(failure_true, failure_probability)

    print("\nModel metrikleri (failure sinifi = 0):")
    print(f"Accuracy  : {accuracy:.4f}")
    print(f"Precision : {precision:.4f}")
    print(f"Recall    : {recall:.4f}")
    print(f"F1-score  : {f1:.4f}")
    print(f"ROC-AUC   : {roc_auc:.4f}")
    print("\nDetayli sinif raporu:")
    print(classification_report(y_test, y_pred, target_names=["failure", "success"]))

    # Modeli kaydet.
    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / "routing_model.pkl"
    joblib.dump(pipeline, model_path)
    print(f"Model kaydedildi: {model_path}")


if __name__ == "__main__":
    main()
