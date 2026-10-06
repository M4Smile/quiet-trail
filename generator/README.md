# Portable LLM Story Generator

Небольшой переносимый модуль, который строит случайную связанную историю для набора сцен. В репозитории нет интерфейса, изображений, анимаций, хранения сессий и аналитики — только LLM-генерация и проверка результата.

## Состав

- `server.py` — функция `generate_story(...)` и минимальный FastAPI API.
- `config/prompts/` — system- и user-промпты генератора.
- `config/story_template.json` — порядок и смысл сцен.
- `catalog.example.json` — пример каталога доступных фонов и персонажей без привязки к файлам.

## Настройка и запуск

Скопируйте `.env.example` в `.env` и задайте параметры OpenAI-совместимого Chat Completions API:

```dotenv
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=...
```

Локальный запуск:

```bash
python -m pip install -r requirements.txt
python server.py
```

API будет доступен по адресу `http://localhost:3000`; Swagger — на `/docs`.

## HTTP API

`POST /api/story` принимает:

```json
{
  "ageGroup": "7-10",
  "context": "История должна происходить осенью",
  "temperature": 0.85,
  "catalog": {
    "backgrounds": [{"id": "forest", "description": "лесная тропа"}],
    "characters": [{"id": "traveler", "name": "Путешественник"}]
  }
}
```

`catalog` необязателен: без него используется `catalog.example.json`. В ответе приходят `story` и упорядоченный массив `scenes`. Генератор проверяет число и порядок сцен, существование всех ID, длину текстов, состав реплик и задержки. При нарушении контракта модель получает одну автоматическую попытку исправить JSON.

## Использование как Python-модуля

```python
from server import generate_story

result = generate_story(
    age_group="7-10",
    context="Тёплое приключение у моря",
    catalog={
        "backgrounds": [{"id": "shore", "description": "тихий берег"}],
        "characters": [{"id": "sailor", "name": "Моряк"}],
    },
)
```

Для другого проекта замените сюжетный шаблон и промпты либо укажите пути через `STORY_TEMPLATE_FILE` и `STORY_CATALOG_FILE`.

## Docker

```bash
docker compose up --build
```

Проверка конфигурации: `GET /api/health`. Ключ API никогда не добавляйте в репозиторий.
