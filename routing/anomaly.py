"""Ortak anomali kaydi ve uygulama yardimcilari."""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd


ANOMALY_RULES: List[Dict[str, Any]] = []


def reset_anomalies() -> None:
    """Kayitli anomali kurallarini temizler."""
    ANOMALY_RULES.clear()


def inject_anomaly(acquirer_id, start_time, end_time, severity):
    """Tek bir anomali kuralini ortak listeye ekler."""
    rule = {
        "acquirer_id": acquirer_id,
        "start_time": pd.to_datetime(start_time),
        "end_time": pd.to_datetime(end_time),
        "severity": float(severity),
    }
    ANOMALY_RULES.append(rule)
    return rule


def get_anomaly_multiplier(acquirer_id, timestamp) -> float:
    """Bir zaman damgasi icin anomali carpani dondurur."""
    current_time = pd.to_datetime(timestamp)
    multiplier = 1.0

    for rule in ANOMALY_RULES:
        if rule["acquirer_id"] != acquirer_id:
            continue
        if rule["start_time"] <= current_time <= rule["end_time"]:
            # Seviye arttikca basari olasiligini daha fazla dusur.
            severity = max(0.0, min(1.0, rule["severity"]))
            multiplier *= max(0.25, 1.0 - (0.55 * severity))

    return multiplier
