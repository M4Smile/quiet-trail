from pathlib import Path
from statistics import median

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / "public/game/characters/traveler-walk.gif"
OUTPUT = PROJECT_ROOT / "public/game/characters/traveler-walk-fixed.gif"


def main() -> None:
    source = Image.open(SOURCE)
    frame_count = source.n_frames
    frames: list[Image.Image] = []

    for index in range(frame_count):
        source.seek(index)
        frames.append(source.copy())

    # The source ends with a very short duplicate of its first frame. It creates
    # a visible hitch at the loop seam, so keep only the actual walking cycle.
    if len(frames) > 1:
        first = frames[0].convert("RGBA")
        last = frames[-1].convert("RGBA")
        if first.tobytes() == last.tobytes():
            frames.pop()

    boxes = [frame.convert("RGBA").getbbox() for frame in frames]
    visible_boxes = [box for box in boxes if box is not None]
    if not visible_boxes:
        raise RuntimeError("The walking animation has no visible pixels")

    target_center_x = round(median((left + right) / 2 for left, _, right, _ in visible_boxes))
    target_baseline = max(bottom for _, _, _, bottom in visible_boxes)
    fixed_frames: list[Image.Image] = []

    for frame, box in zip(frames, boxes, strict=True):
        if box is None:
            fixed_frames.append(frame)
            continue

        left, _, right, bottom = box
        offset_x = round(target_center_x - (left + right) / 2)
        offset_y = target_baseline - bottom
        fixed = Image.new("RGBA", source.size, color=(0, 0, 0, 0))
        fixed.alpha_composite(frame.convert("RGBA"), (offset_x, offset_y))
        fixed_frames.append(fixed)

    fixed_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=fixed_frames[1:],
        duration=80,
        loop=0,
        disposal=2,
        optimize=False,
    )

    print(OUTPUT)


if __name__ == "__main__":
    main()
