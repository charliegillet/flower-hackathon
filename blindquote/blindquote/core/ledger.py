"""Disclosure ledger: who learned what during a run."""

from __future__ import annotations

from typing import Any

RAW_PROFILE_FIELDS = ["name", "exact income", "assets", "exact credit score", "monthly debts", "employer"]


class Ledger:
    def __init__(self) -> None:
        self._learned: dict[str, dict[str, Any]] = {}

    def party(self, name: str, role: str) -> None:
        self._learned.setdefault(name, {"role": role, "learned": []})

    def learn(self, name: str, item: str) -> None:
        entry = self._learned.setdefault(name, {"role": "unknown", "learned": []})
        if item not in entry["learned"]:
            entry["learned"].append(item)

    def to_event(self) -> dict[str, Any]:
        parties = []
        for name, entry in self._learned.items():
            role = entry["role"]
            if role == "bank":
                never = RAW_PROFILE_FIELDS + ["other banks' identities", "other banks' quotes"]
            elif role == "bureau":
                never = ["loan amount", "property", "which banks are bidding", "any quotes"]
            elif role == "coordinator":
                never = RAW_PROFILE_FIELDS + ["bank rate sheets", "bank floors & margins"]
            else:
                never = ["bank rate sheets", "bank floors & margins", "exact credit score (bureau-held)"]
            parties.append({"party": name, "role": role, "learned": entry["learned"], "never": never})
        return {"type": "bq.ledger", "parties": parties}
