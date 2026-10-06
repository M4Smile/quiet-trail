"""Portable LLM story generator with a small FastAPI adapter.

The public function is ``generate_story``. It can be imported by another
project or exposed through POST /api/story by running this file directly.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException


ROOT = Path(__file__).resolve().parent
PROMPT_DIR = ROOT / "config" / "prompts"
TEMPLATE_FILE = Path(
    os.getenv("STORY_TEMPLATE_FILE", str(ROOT / "config" / "story_template.json"))
)
CATALOG_FILE = Path(
    os.getenv("STORY_CATALOG_FILE", str(ROOT / "catalog.example.json"))
)


def _load_dotenv() -> None:
    """Load a local .env without adding a dependency."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

PORT = int(os.getenv("PORT", "3000"))
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "90"))


class StoryValidationError(ValueError):
    """The model returned JSON that does not match the story contract."""


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Required file is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"Expected a JSON object in {path}")
    return value


def _read_prompt(name: str, **values: str) -> str:
    text = (PROMPT_DIR / name).read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def llm_configured() -> bool:
    return bool(LLM_MODEL)


def _chat_completions_url() -> str:
    if LLM_BASE_URL.endswith("/chat/completions"):
        return LLM_BASE_URL
    return f"{LLM_BASE_URL}/chat/completions"


def _extract_json(content: str) -> dict[str, Any]:
    if not isinstance(content, str):
        raise StoryValidationError("The model response content must be text")
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise StoryValidationError("The model response contains no JSON object")
        try:
            value = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise StoryValidationError(f"The model returned invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise StoryValidationError("The model response must be a JSON object")
    return value


def _post_chat_completions(
    messages: list[dict[str, str]], temperature: float, max_tokens: int
) -> dict[str, Any]:
    if not llm_configured():
        raise RuntimeError("Set LLM_API_KEY and LLM_MODEL before generating a story")

    payload: dict[str, Any] = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    def request(body: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if LLM_API_KEY:
            headers["Authorization"] = f"Bearer {LLM_API_KEY}"
        req = urllib.request.Request(
            _chat_completions_url(),
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=LLM_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1000]
            raise RuntimeError(f"LLM provider returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RuntimeError(f"Could not reach the LLM provider: {exc}") from exc

    try:
        response = request(payload)
    except RuntimeError as exc:
        # Some OpenAI-compatible providers do not implement response_format.
        if "HTTP 400" not in str(exc):
            raise
        payload.pop("response_format", None)
        response = request(payload)

    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("LLM provider returned an unexpected response shape") from exc
    return _extract_json(content)


def _catalog_ids(catalog: dict[str, Any]) -> tuple[set[str], set[str]]:
    if not isinstance(catalog, dict):
        raise StoryValidationError("catalog must be a JSON object")
    backgrounds = catalog.get("backgrounds")
    characters = catalog.get("characters")
    if not isinstance(backgrounds, list) or not isinstance(characters, list):
        raise StoryValidationError("catalog must contain backgrounds[] and characters[]")

    def ids(items: list[Any], label: str) -> set[str]:
        result = {
            item.get("id")
            for item in items
            if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip()
        }
        if not result:
            raise StoryValidationError(f"catalog.{label} must contain at least one item with an id")
        return result

    return ids(backgrounds, "backgrounds"), ids(characters, "characters")


def _nonempty_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise StoryValidationError(f"{field} must be a non-empty string")
    return value.strip()


def validate_story(
    candidate: dict[str, Any], template: dict[str, Any], catalog: dict[str, Any]
) -> dict[str, Any]:
    """Validate and normalize an LLM response against the configured contract."""
    background_ids, character_ids = _catalog_ids(catalog)
    tasks = template.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise StoryValidationError("story template must contain a non-empty tasks[]")

    expected_task_ids = [task.get("id") for task in tasks if isinstance(task, dict)]
    if len(expected_task_ids) != len(tasks) or any(not isinstance(item, str) for item in expected_task_ids):
        raise StoryValidationError("every template task must have a string id")

    story = candidate.get("story")
    scenes = candidate.get("scenes")
    if not isinstance(story, dict) or not isinstance(scenes, list):
        raise StoryValidationError("response must contain story{} and scenes[]")
    if len(scenes) != len(tasks):
        raise StoryValidationError(f"expected {len(tasks)} scenes, got {len(scenes)}")
    if [scene.get("taskId") for scene in scenes if isinstance(scene, dict)] != expected_task_ids:
        raise StoryValidationError("scene taskId values must match template order exactly")

    normalized_story = {
        "title": _nonempty_text(story.get("title"), "story.title"),
        "prologue": _nonempty_text(story.get("prologue"), "story.prologue"),
        "epilogue": _nonempty_text(story.get("epilogue"), "story.epilogue"),
    }
    normalized_scenes: list[dict[str, Any]] = []

    for index, (raw_scene, task) in enumerate(zip(scenes, tasks, strict=True)):
        field = f"scenes[{index}]"
        if not isinstance(raw_scene, dict):
            raise StoryValidationError(f"{field} must be an object")
        background_id = raw_scene.get("backgroundId")
        if background_id not in background_ids:
            raise StoryValidationError(f"{field}.backgroundId is not in the catalog")

        raw_character_ids = raw_scene.get("characterIds")
        if not isinstance(raw_character_ids, list) or not 1 <= len(raw_character_ids) <= 2:
            raise StoryValidationError(f"{field}.characterIds must contain one or two ids")
        selected = list(dict.fromkeys(raw_character_ids))
        if len(selected) != len(raw_character_ids) or any(item not in character_ids for item in selected):
            raise StoryValidationError(f"{field}.characterIds contains a duplicate or unknown id")

        raw_dialogues = raw_scene.get("dialogues")
        if not isinstance(raw_dialogues, list) or not 1 <= len(raw_dialogues) <= 3:
            raise StoryValidationError(f"{field}.dialogues must contain one to three entries")
        dialogues: list[dict[str, Any]] = []
        speakers: set[str] = set()
        previous_delay: int | None = None
        for dialogue_index, raw_dialogue in enumerate(raw_dialogues):
            dialogue_field = f"{field}.dialogues[{dialogue_index}]"
            if not isinstance(raw_dialogue, dict):
                raise StoryValidationError(f"{dialogue_field} must be an object")
            speaker = raw_dialogue.get("characterId")
            if speaker not in selected:
                raise StoryValidationError(f"{dialogue_field}.characterId is not in the scene")
            dialogue_text = _nonempty_text(raw_dialogue.get("text"), f"{dialogue_field}.text")
            if len(dialogue_text.split()) > 24:
                raise StoryValidationError(f"{dialogue_field}.text exceeds 24 words")
            delay = raw_dialogue.get("delayMs")
            if not isinstance(delay, int):
                raise StoryValidationError(f"{dialogue_field}.delayMs must be an integer")
            if previous_delay is None and not 800 <= delay <= 1400:
                raise StoryValidationError(f"{dialogue_field}.delayMs must be between 800 and 1400")
            if previous_delay is not None and delay - previous_delay < 2800:
                raise StoryValidationError(
                    f"{dialogue_field}.delayMs must be at least 2800 ms after the previous line"
                )
            previous_delay = delay
            speakers.add(speaker)
            dialogues.append({"characterId": speaker, "text": dialogue_text, "delayMs": delay})

        if speakers != set(selected):
            raise StoryValidationError(f"every character in {field} must have a dialogue line")
        scene_story = _nonempty_text(raw_scene.get("story"), f"{field}.story")
        if len(scene_story.split()) > 35:
            raise StoryValidationError(f"{field}.story exceeds 35 words")

        normalized_scenes.append(
            {
                "taskId": task["id"],
                "backgroundId": background_id,
                "characterIds": selected,
                "story": scene_story,
                "dialogues": dialogues,
            }
        )

    return {"story": normalized_story, "scenes": normalized_scenes}


def generate_story(
    age_group: str = "7-10",
    *,
    catalog: dict[str, Any] | None = None,
    context: str = "",
    temperature: float = 0.85,
) -> dict[str, Any]:
    """Generate one story; retry once when the model breaks the JSON contract."""
    template = _load_json(TEMPLATE_FILE)
    selected_catalog = catalog if catalog is not None else _load_json(CATALOG_FILE)
    _catalog_ids(selected_catalog)

    scene_count = len(template.get("tasks", []))
    system = _read_prompt("story.system.md", SCENE_COUNT=str(scene_count))
    user = _read_prompt(
        "story.user.md",
        AGE_GROUP=age_group.strip() or "7-10",
        CONTEXT=context.strip() or "Нет дополнительных пожеланий.",
        CATALOG_JSON=json.dumps(selected_catalog, ensure_ascii=False, indent=2),
        STORY_TEMPLATE_JSON=json.dumps(template, ensure_ascii=False, indent=2),
        SCENE_COUNT=str(scene_count),
    )
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    bounded_temperature = min(1.5, max(0.0, float(temperature)))

    last_error: StoryValidationError | None = None
    for attempt in range(2):
        candidate: dict[str, Any] | None = None
        try:
            candidate = _post_chat_completions(messages, bounded_temperature, max_tokens=3000)
            return validate_story(candidate, template, selected_catalog)
        except StoryValidationError as exc:
            last_error = exc
            if attempt == 0:
                if candidate is not None:
                    messages.append(
                        {"role": "assistant", "content": json.dumps(candidate, ensure_ascii=False)}
                    )
                messages.append(
                    {
                        "role": "user",
                        "content": f"Исправь ответ и верни полный валидный JSON. Ошибка проверки: {exc}",
                    }
                )
    raise StoryValidationError(f"LLM response failed validation twice: {last_error}")


app = FastAPI(title="Portable LLM Story Generator", version="1.0.0")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "llmConfigured": llm_configured(), "model": LLM_MODEL or None}


@app.post("/api/story")
def story(body: dict[str, Any]) -> dict[str, Any]:
    try:
        return generate_story(
            age_group=str(body.get("ageGroup", "7-10")),
            catalog=body.get("catalog"),
            context=str(body.get("context", "")),
            temperature=float(body.get("temperature", 0.85)),
        )
    except StoryValidationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (RuntimeError, TypeError, ValueError) as exc:
        status = 503 if not llm_configured() else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
