"""Model selection. The lead investigator and its sub-agents run on any of:
  bedrock    Claude on Amazon Bedrock (AWS credentials in the environment)
  anthropic  Claude via the Anthropic API (ANTHROPIC_API_KEY)
  openrouter any OpenRouter model, e.g. an open Qwen3 (OPENROUTER_API_KEY)
  local      an OpenAI-compatible local server such as vLLM or Ollama (CI_LOCAL_URL)
Set CI_LLM_PROVIDER and CI_MODEL in .env.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    p = ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split(" #", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


_load_env()

DEFAULTS = {
    "bedrock": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "anthropic": "claude-sonnet-5-5",
    "openrouter": "anthropic/claude-sonnet-4.5",
    "local": "qwen3",
}


def provider() -> str:
    return os.environ.get("CI_LLM_PROVIDER", "bedrock").strip().lower()


def model_name() -> str:
    return os.environ.get("CI_MODEL") or DEFAULTS.get(provider(), "")


def label() -> str:
    return f"{provider()} · {model_name()}"


def configured() -> bool:
    p = provider()
    if p == "bedrock":
        return bool(os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_PROFILE") or os.environ.get("AWS_BEARER_TOKEN_BEDROCK"))
    if p == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    if p == "openrouter":
        return bool(os.environ.get("OPENROUTER_API_KEY"))
    if p == "local":
        return bool(os.environ.get("CI_LOCAL_URL"))
    return False


@lru_cache(maxsize=4)
def chat(temperature: float = 0.0):
    p, m = provider(), model_name()
    if p == "bedrock":
        from langchain_aws import ChatBedrockConverse

        return ChatBedrockConverse(model=m, region_name=os.environ.get("AWS_REGION", "us-east-1"), temperature=temperature, max_tokens=4096)
    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=m, temperature=temperature, max_tokens=4096)
    from langchain_openai import ChatOpenAI

    if p == "openrouter":
        return ChatOpenAI(model=m, base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"], temperature=temperature, max_tokens=4096, seed=7)
    return ChatOpenAI(model=m, base_url=os.environ["CI_LOCAL_URL"], api_key=os.environ.get("CI_LOCAL_KEY", "local"), temperature=temperature, max_tokens=4096, seed=7)
