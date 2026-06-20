import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LYRIC_DIR = Path(r"D:\KuGou\Lyric")
OUTPUT_DIR = PROJECT_ROOT / "output"

KRC_FILE_RE = re.compile(
    r"^(?P<prefix>.+)-(?P<hash>[0-9a-fA-F]{32})-(?P<song_id>\d+)-(?P<flags>[0-9A-Fa-f]{8})$"
)


@dataclass
class SongRecord:
    songName: str
    artist: str


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def split_artist_and_song(prefix: str) -> tuple[str, str]:
    normalized = clean_text(prefix)
    if " - " in normalized:
        artist, song_name = normalized.split(" - ", 1)
        return clean_text(artist), clean_text(song_name)
    return "", normalized


def parse_krc_file(file_path: Path) -> SongRecord | None:
    if file_path.suffix.lower() != ".krc":
        return None

    stem = file_path.stem
    match = KRC_FILE_RE.match(stem)
    if not match:
        artist, song_name = split_artist_and_song(stem)
        return SongRecord(
            songName=song_name,
            artist=artist,
        )

    prefix = match.group("prefix")
    artist, song_name = split_artist_and_song(prefix)

    return SongRecord(
        songName=song_name,
        artist=artist,
    )


def dedupe_records(records: list[SongRecord]) -> list[SongRecord]:
    seen = set()
    result = []
    for record in records:
        key = clean_text(record.songName).casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(record)
    return result


def collect_records(lyric_dir: Path) -> tuple[list[SongRecord], int]:
    records = []
    parse_failures = 0

    for file_path in sorted(lyric_dir.glob("*.krc"), key=lambda item: item.name.casefold()):
        record = parse_krc_file(file_path)
        if not record:
            parse_failures += 1
            continue
        if not record.songName:
            parse_failures += 1
            continue
        records.append(record)

    return dedupe_records(records), parse_failures


def write_json(lyric_dir: Path, records: list[SongRecord], parse_failures: int) -> Path:
    payload = {
        "exportedAt": datetime.now().astimezone().isoformat(),
        "sourceDir": str(lyric_dir),
        "count": len(records),
        "parseFailures": parse_failures,
        "items": [asdict(record) for record in records],
    }
    output_file = OUTPUT_DIR / f"kugou-lyric-files-{datetime.now().strftime('%Y-%m-%dT%H-%M-%S')}.json"
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export song names and artists from Kugou .krc lyric filenames."
    )
    parser.add_argument(
        "--lyric-dir",
        default=str(DEFAULT_LYRIC_DIR),
        help=f"Directory containing Kugou .krc files. Default: {DEFAULT_LYRIC_DIR}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    lyric_dir = Path(args.lyric_dir)

    if not lyric_dir.exists():
        raise RuntimeError(f"Lyric directory does not exist: {lyric_dir}")
    if not lyric_dir.is_dir():
        raise RuntimeError(f"Lyric path is not a directory: {lyric_dir}")

    ensure_output_dir()
    records, parse_failures = collect_records(lyric_dir)

    if not records:
        raise RuntimeError(f"No .krc songs were parsed from: {lyric_dir}")

    output_file = write_json(lyric_dir, records, parse_failures)
    print(f"Parsed {len(records)} songs from {lyric_dir}")
    print(f"JSON file: {output_file}")
    if parse_failures:
        print(f"Skipped or partially failed entries: {parse_failures}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Cancelled.")
        sys.exit(130)
    except Exception as exc:
        print(f"Run failed: {exc}")
        sys.exit(1)
