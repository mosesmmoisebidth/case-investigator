"""Case Investigator API (FastAPI). Endpoints grow milestone by milestone."""

import os

from fastapi import FastAPI

app = FastAPI(title="VeriSec Case Investigator", version="0.1.0")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": os.getenv("CI_MODEL_LABEL", "not configured")}
