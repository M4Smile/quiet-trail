from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT.parent / "свеча" / "сущности" / "animations"
TARGET_ROOT = PROJECT_ROOT / "public" / "game" / "candle" / "entities" / "animations"

SHEETS = {
    "traveler-spritesheet.png": "traveller",
    "rabbit-spritesheet.png": "hare",
    "crow-spritesheet.png": "raven",
    "fox-spritesheet.png": "fox",
    "deer-spritesheet.png": "deer",
}


def largest_component(alpha: np.ndarray, threshold: int = 8) -> np.ndarray:
    """Keep the main silhouette and discard detached sprite-sheet fragments."""
    active = alpha > threshold
    visited = np.zeros(active.shape, dtype=bool)
    best: list[tuple[int, int]] = []

    for y, x in zip(*np.where(active & ~visited)):
        if visited[y, x]:
            continue

        component: list[tuple[int, int]] = []
        queue = deque([(int(y), int(x))])
        visited[y, x] = True

        while queue:
            current_y, current_x = queue.pop()
            component.append((current_y, current_x))
            for next_y, next_x in (
                (current_y - 1, current_x),
                (current_y + 1, current_x),
                (current_y, current_x - 1),
                (current_y, current_x + 1),
                (current_y - 1, current_x - 1),
                (current_y - 1, current_x + 1),
                (current_y + 1, current_x - 1),
                (current_y + 1, current_x + 1),
            ):
                if (
                    0 <= next_y < active.shape[0]
                    and 0 <= next_x < active.shape[1]
                    and active[next_y, next_x]
                    and not visited[next_y, next_x]
                ):
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))

        if len(component) > len(best):
            best = component

    mask = np.zeros(active.shape, dtype=np.uint8)
    if best:
        ys, xs = zip(*best)
        mask[ys, xs] = 255
    return mask


def clean_frame(frame: Image.Image) -> Image.Image:
    rgba = np.array(frame.convert("RGBA"))
    main_mask = largest_component(rgba[:, :, 3])

    # Keep the antialiased edge around the retained silhouette without
    # bringing back detached pixels from a neighbouring cell.
    expanded_mask = np.array(
        Image.fromarray(main_mask, mode="L").filter(ImageFilter.MaxFilter(3)),
    )
    rgba[:, :, 3] = np.where(expanded_mask > 0, rgba[:, :, 3], 0)
    return Image.fromarray(rgba, mode="RGBA")


def main() -> None:
    for sheet_name, target_name in SHEETS.items():
        sheet_path = SOURCE_ROOT / sheet_name
        target_dir = TARGET_ROOT / target_name
        target_dir.mkdir(parents=True, exist_ok=True)

        with Image.open(sheet_path) as sheet:
            sheet = sheet.convert("RGBA")
            cell_width = sheet.width // 3
            cell_height = sheet.height // 2

            for row, prefix in enumerate(("move", "gesture")):
                for column in range(3):
                    box = (
                        column * cell_width,
                        row * cell_height,
                        (column + 1) * cell_width,
                        (row + 1) * cell_height,
                    )
                    frame = clean_frame(sheet.crop(box))
                    frame.save(target_dir / f"{prefix}-{column + 1}.png")


if __name__ == "__main__":
    main()
