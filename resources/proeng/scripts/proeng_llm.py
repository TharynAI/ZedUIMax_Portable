#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List


def fail(message: str, code: int = 1) -> None:
    sys.stderr.write(message.strip() + "\n")
    raise SystemExit(code)


def read_input() -> Dict[str, Any]:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        fail(f"Invalid ProEng bridge input: {exc}")

    if not isinstance(payload, dict):
        fail("ProEng bridge payload must be a JSON object.")
    return payload


def strip_code_fences(text: str) -> str:
    value = text.strip()
    if value.startswith("```"):
        lines = value.splitlines()
        if len(lines) >= 3:
            value = "\n".join(lines[1:-1]).strip()
    return value


def parse_json_block(text: str) -> Dict[str, Any]:
    candidate = strip_code_fences(text)
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            fail("Provider response did not include a JSON object.")
        try:
            value = json.loads(candidate[start:end + 1])
        except json.JSONDecodeError as exc:
            fail(f"Provider response JSON parse failed: {exc}")

    if not isinstance(value, dict):
        fail("Provider response JSON must be an object.")
    return value


def http_json(url: str, headers: Dict[str, str], body: Dict[str, Any]) -> Dict[str, Any]:
    body_bytes = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
      with urllib.request.urlopen(request, timeout=120) as response:
          response_text = response.read().decode("utf-8")
          return {
              "status": response.status,
              "text": response_text,
              "json": json.loads(response_text),
          }
    except urllib.error.HTTPError as exc:
      response_text = exc.read().decode("utf-8", errors="replace")
      fail(f"Provider HTTP {exc.code}: {response_text}")
    except urllib.error.URLError as exc:
      fail(f"Provider request failed: {exc}")


def join_parts(parts: List[Dict[str, Any]]) -> str:
    texts = []
    for part in parts:
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            texts.append(part["text"])
    return "".join(texts).strip()


def call_openai(model: str, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        fail("OPENAI_API_KEY is not available in WSL.")

    body = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    response = http_json(
        "https://api.openai.com/v1/chat/completions",
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        body,
    )
    content = response["json"]["choices"][0]["message"]["content"]
    return {
        "content": content,
        "raw_request": json.dumps(body, indent=2),
        "raw_response": response["text"],
    }


def call_anthropic(model: str, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        fail("ANTHROPIC_API_KEY is not available in WSL.")

    body = {
        "model": model,
        "max_tokens": 1800,
        "temperature": 0.2,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_prompt},
        ],
    }
    response = http_json(
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body,
    )
    content = join_parts(response["json"].get("content", []))
    return {
        "content": content,
        "raw_request": json.dumps(body, indent=2),
        "raw_response": response["text"],
    }


def call_gemini(model: str, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        fail("GEMINI_API_KEY or GOOGLE_API_KEY is not available in WSL.")

    body = {
        "system_instruction": {
            "parts": [{"text": system_prompt}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
        },
    }
    response = http_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        {
            "Content-Type": "application/json",
        },
        body,
    )
    candidates = response["json"].get("candidates", [])
    if not candidates:
        fail(f"Gemini returned no candidates: {response['text']}")
    content = "".join(
        part.get("text", "")
        for part in candidates[0].get("content", {}).get("parts", [])
        if isinstance(part, dict)
    ).strip()
    return {
        "content": content,
        "raw_request": json.dumps(body, indent=2),
        "raw_response": response["text"],
    }


def main() -> None:
    payload = read_input()
    provider = payload.get("provider")
    model = str(payload.get("model", "")).strip()
    system_prompt = str(payload.get("systemPrompt", "")).strip()
    user_prompt = str(payload.get("userPrompt", "")).strip()

    if provider not in {"openai", "anthropic", "gemini"}:
        fail(f"Unsupported ProEng provider: {provider}")
    if not model:
        fail("ProEng bridge model is required.")
    if not system_prompt:
        fail("ProEng bridge systemPrompt is required.")
    if not user_prompt:
        fail("ProEng bridge userPrompt is required.")

    if provider == "openai":
        result = call_openai(model, system_prompt, user_prompt)
    elif provider == "anthropic":
        result = call_anthropic(model, system_prompt, user_prompt)
    else:
        result = call_gemini(model, system_prompt, user_prompt)

    parsed = parse_json_block(result["content"])
    assistant_message = str(parsed.get("assistant_message", "")).strip()
    revised_prompt = str(parsed.get("revised_prompt", "")).strip()
    auto_summary = str(parsed.get("auto_summary", "")).strip()

    if not assistant_message:
        fail("Provider JSON response missing assistant_message.")
    if not revised_prompt:
        fail("Provider JSON response missing revised_prompt.")

    json.dump(
        {
            "assistantMessage": assistant_message,
            "revisedPrompt": revised_prompt,
            "autoSummary": auto_summary,
            "rawRequest": result["raw_request"],
            "rawResponse": result["raw_response"],
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
