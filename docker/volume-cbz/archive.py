#!/usr/bin/env python3
"""Export completed Suwayomi volumes to CBZ using the native archive API."""

import argparse
import base64
from collections import defaultdict
from contextlib import contextmanager
from decimal import Decimal
import fcntl
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from itertools import islice
import logging
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import time
from threading import Thread
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile


NUMBER = r"[0-9]{1,4}"
VOLUME = re.compile(
    rf"^\s*(?:第\s*)?(?P<cjk>{NUMBER})\s*[卷巻册冊](?=$|[^0-9])"
    rf"|^\s*vol(?:ume)?\.?\s*(?P<en>{NUMBER})(?=$|[^0-9])",
    re.IGNORECASE,
)
BOUNDARY = re.compile(r"^[\s.·:：_—–\-（(\[【]+")
CHAPTER_LABEL = re.compile(
    r"^(?:第\s*(?P<cjk>\d+(?:\.\d+)?)\s*[话話章节節回]|ch(?:apter)?\.?\s*(?P<en>\d+(?:\.\d+)?))",
    re.I,
)
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".jxl"}
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
PAGE_SIZE = 100
CHAPTER_FIELDS = "id name isDownloaded pageCount"
ARCHIVE_LIMIT = 2 * 1024**3


class ArchiveError(Exception):
    pass


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Suwayomi:
    def __init__(self, config):
        base = config.get("LN_SUWAYOMI_URL") or config.get("SUWAYOMI_URL") or ""
        parsed = urlsplit(base)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username is not None
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ArchiveError("Suwayomi URL must be an HTTP(S) origin")
        self.base = base.rstrip("/")
        self.opener = build_opener(ProxyHandler({}), RejectRedirects())
        user = config.get("LN_SUWAYOMI_USERNAME") or config.get("SUWAYOMI_USERNAME") or ""
        password = config.get("LN_SUWAYOMI_PASSWORD") or config.get("SUWAYOMI_PASSWORD") or ""
        if bool(user) != bool(password):
            raise ArchiveError("Suwayomi Basic authentication needs both username and password")
        self.headers = {}
        if user:
            credentials = base64.b64encode(f"{user}:{password}".encode()).decode()
            self.headers["Authorization"] = f"Basic {credentials}"

    @contextmanager
    def request(self, path, data=None):
        headers = dict(self.headers)
        if data is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(data).encode()
        try:
            with self.opener.open(Request(self.base + path, data, headers), timeout=30) as response:
                yield response
        except HTTPError as exc:
            exc.close()
            raise ArchiveError(f"Suwayomi HTTP {exc.code}") from None
        except (URLError, TimeoutError) as exc:
            raise ArchiveError(f"Suwayomi request failed ({type(exc).__name__})") from None

    def graphql(self, query, **variables):
        with self.request("/api/graphql", {"query": query, "variables": variables}) as response:
            try:
                payload = json.loads(response.read(4 * 1024**2))
            except (UnicodeError, ValueError):
                raise ArchiveError("Suwayomi returned invalid GraphQL JSON") from None
        if not isinstance(payload, dict) or payload.get("errors") or not isinstance(payload.get("data"), dict):
            raise ArchiveError("Suwayomi rejected the archive GraphQL query")
        return payload["data"]

    def chapters(self, condition, fields):
        # Conditions are fixed strings supplied by the caller, never source text.
        id_argument = ", $id: Int!" if "id" in condition else ""
        query = f"""query ArchiveChapters($offset: Int!{id_argument}) {{
          chapters(condition: {{ {condition['query']} }}, first: {PAGE_SIZE}, offset: $offset) {{
            nodes {{ {fields} }} pageInfo {{ hasNextPage }}
          }}
        }}"""
        offset = 0
        arguments = {"id": condition["id"]} if "id" in condition else {}
        while True:
            result = self.graphql(query, offset=offset, **arguments).get("chapters")
            if (not isinstance(result, dict) or not isinstance(result.get("nodes"), list)
                    or not isinstance(result.get("pageInfo", {}).get("hasNextPage"), bool)):
                raise ArchiveError("Suwayomi returned incomplete chapter pagination")
            nodes = result["nodes"]
            yield from nodes
            if not result["pageInfo"]["hasNextPage"]:
                return
            if not nodes:
                raise ArchiveError("Suwayomi returned empty intermediate chapter page")
            offset += len(nodes)

    def download_status(self):
        data = self.graphql("""query ArchiveDownloadProgress {
          downloadStatus { state queue { state progress chapter { id mangaId name } } }
        }""").get("downloadStatus")
        if not isinstance(data, dict) or not isinstance(data.get("queue"), list):
            raise ArchiveError("Suwayomi returned an incomplete download queue")
        queue = []
        for task in data["queue"]:
            chapter = task["chapter"]
            progress = task["progress"]
            if progress is not None and (not isinstance(progress, (int, float)) or not 0 <= progress <= 1):
                raise ArchiveError("Suwayomi returned invalid download progress")
            queue.append({
                "mangaId": str(chapter["mangaId"]), "chapterId": str(chapter["id"]), "chapterName": chapter["name"],
                "state": task["state"], "percent": None if progress is None else math.floor(progress * 100 + 0.5),
            })
        return {"state": data["state"], "queue": queue}

    def downloaded_mangas(self):
        return {row["manga"]["id"]: row["manga"] for row in self.chapters(
            {"query": "isDownloaded: true"}, "manga { id title sourceId }"
        )}

    def manga(self, manga_id):
        return self.graphql("query($id: Int!) { manga(id: $id) { id title sourceId } }", id=manga_id)["manga"]

    def manga_chapters(self, manga_id):
        return self.chapters({"query": "mangaId: $id", "id": manga_id}, CHAPTER_FIELDS)

    def chapter_zip(self, chapter_id, output):
        with self.request(f"/api/v1/chapter/{int(chapter_id)}/download?markAsRead=false") as response:
            size = 0
            while chunk := response.read(1024**2):
                size += len(chunk)
                if size > ARCHIVE_LIMIT:
                    raise ArchiveError("chapter archive exceeds size limit")
                output.write(chunk)
        output.seek(0)


def volume_label(name):
    name = name.translate(DIGITS)
    match = VOLUME.match(name)
    if not match:
        return None
    volume = int(match["cjk"] or match["en"])
    if volume < 1:
        return None
    rest = name[match.end():].strip()
    if not rest:
        return volume, None
    marker = CHAPTER_LABEL.match(BOUNDARY.sub("", rest))
    if marker:
        return volume, Decimal(marker["cjk"] or marker["en"])
    return None


def planned_volumes(chapters):
    groups = defaultdict(list)
    for row in chapters:
        label = volume_label(row["name"])
        if label is not None:
            number, chapter_number = label
            groups[number].append((chapter_number, row))
    for volume, entries in sorted(groups.items()):
        whole = [row for number, row in entries if number is None]
        if len(whole) > 1 or (not whole and len({number for number, _ in entries}) != len(entries)):
            logging.warning("volume %s skipped: duplicate entries need an explicit edition", volume)
            continue
        # A source's whole-volume entry takes precedence over separately labelled chapters.
        yield volume, whole or [row for _, row in sorted(entries, key=lambda entry: entry[0])]


def complete_volumes(chapters):
    for volume, selected in planned_volumes(chapters):
        if all(row["isDownloaded"] is True for row in selected):
            yield volume, selected


def natural_key(value):
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value, flags=re.ASCII)]


def series_directory(root, manga):
    manga_id = int(manga["id"])
    source_id = int(manga["sourceId"])
    suffix = f" [{source_id}-{manga_id}]"
    matches = [entry for entry in root.iterdir() if entry.name.endswith(suffix) and entry.is_dir()]
    if len(matches) > 1 or any(entry.is_symlink() for entry in matches):
        raise ArchiveError(f"ambiguous archive directory for manga {manga_id}")
    if matches:
        return matches[0]
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", manga["title"]).strip(" .")
    title = title.encode()[:160].decode(errors="ignore") or "漫画"
    return root / (title + suffix)


def comic_info(manga, volume, page_count):
    info = ElementTree.Element("ComicInfo")
    for tag, value in [("Series", manga["title"]), ("Title", f"第{volume:02}卷"),
                       ("Number", str(volume)), ("PageCount", str(page_count))]:
        ElementTree.SubElement(info, tag).text = value
    return ElementTree.tostring(info, encoding="utf-8", xml_declaration=True)


def add_chapter_pages(client, archive, chapter, first_page):
    with tempfile.TemporaryFile() as downloaded:
        client.chapter_zip(chapter["id"], downloaded)
        with ZipFile(downloaded) as source:
            pages = [item for item in source.infolist() if not item.is_dir()
                     and not any(part.startswith((".", "__MACOSX")) for part in PurePosixPath(item.filename).parts)
                     and PurePosixPath(item.filename).suffix.lower() in IMAGE_SUFFIXES]
            pages.sort(key=lambda item: natural_key(item.filename))
            expected = chapter["pageCount"]
            if not pages or (expected > 0 and len(pages) != expected):
                raise ArchiveError(f"chapter {chapter['id']} has {len(pages)} archive pages; expected {expected}")
            if sum(item.file_size for item in pages) > ARCHIVE_LIMIT or any(item.file_size <= 0 for item in pages):
                raise ArchiveError(f"chapter {chapter['id']} contains invalid image sizes")
            for index, item in enumerate(pages, first_page):
                suffix = PurePosixPath(item.filename).suffix.lower()
                with source.open(item) as image, archive.open(f"{index:06}{suffix}", "w") as output:
                    shutil.copyfileobj(image, output, 1024**2)
    return len(pages)


def archive_signature(chapters):
    return json.dumps({"version": 1, "chapters": [[row["id"], row["pageCount"]] for row in chapters]},
                      separators=(",", ":")).encode()


def storage_roots(root, settings):
    if not settings:
        return root, []
    try:
        data = json.loads(settings.read_text())
    except FileNotFoundError:
        return root, []

    def subfolder(relative):
        result = root
        for name in relative.split("/") if relative else []:
            if not name or name.startswith(".") or re.search(r"[\\:\x00-\x1f\x7f]", name):
                raise ArchiveError("invalid storage subfolder")
            result = result / name
            if result.is_symlink() or not result.is_dir():
                raise ArchiveError("storage subfolder unavailable")
        return result

    current = subfolder(data["mangaFolder"])
    previous = []
    for name in data["mangaPrevious"]:
        try:
            previous.append(subfolder(name))
        except ArchiveError:
            continue
    return current, previous


def volume_path(root, previous, manga, number):
    filename = f"第{number:02}卷.cbz"
    target = series_directory(root, manga) / filename
    for parent in [root, *previous]:
        existing = series_directory(parent, manga) / filename
        if existing.exists() or existing.is_symlink():
            return existing
    return target


def volume_catalog(client, root, manga_id, previous=()):
    manga = client.manga(manga_id)
    if not manga or str(manga["sourceId"]) == "0":
        return {"volumes": []}
    chapters = list(islice(client.manga_chapters(manga_id), 5001))
    if len(chapters) > 5000:
        raise ArchiveError("chapter catalog exceeds lookup limit")
    volumes = []
    for number, selected in planned_volumes(chapters):
        filename = f"第{number:02}卷.cbz"
        destination = volume_path(root, previous, manga, number)
        archived = False
        if destination.is_file() and not destination.is_symlink():
            try:
                with ZipFile(destination) as archive:
                    archived = archive.comment == archive_signature(selected)
            except BadZipFile:
                pass
        volumes.append({
            "number": number,
            "chapterIds": [str(row["id"]) for row in selected],
            "downloaded": sum(row["isDownloaded"] is True for row in selected),
            "filename": filename if archived else None,
        })
    return {"volumes": volumes}


def start_status_server(client, root, port, settings=None):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(5)
            super().setup()

        def do_GET(self):
            match = re.fullmatch(r"/manga/([1-9][0-9]{0,9})/volumes", self.path)
            try:
                if self.path == "/downloads":
                    result = client.download_status()
                elif match and int(match[1]) <= 2**31 - 1:
                    current, previous = storage_roots(root, settings)
                    result = volume_catalog(client, current, int(match[1]), previous)
                else:
                    self.send_error(404)
                    return
                body = json.dumps(result).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                return
            except (ArchiveError, OSError, ValueError, TypeError, KeyError):
                self.send_error(503)

        def log_message(self, *_args):
            pass

    server = HTTPServer(("0.0.0.0", port), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    return server


def archive_volume(client, root, manga, volume, chapters, previous=()):
    destination = volume_path(root, previous, manga, volume)
    folder = destination.parent
    signature = archive_signature(chapters)
    if len(signature) > 65535:
        raise ArchiveError("too many chapters for one volume archive")
    if destination.is_symlink():
        raise ArchiveError("existing CBZ is a symbolic link")
    if destination.exists():
        with ZipFile(destination) as current:
            if current.comment == signature:
                return False
            try:
                previous = json.loads(current.comment)
            except (UnicodeError, ValueError):
                raise ArchiveError("existing CBZ belongs to a different exporter") from None
            if not isinstance(previous, dict) or previous.get("version") != 1 or not isinstance(previous.get("chapters"), list):
                raise ArchiveError("existing CBZ belongs to a different exporter")
            current_ids = {row["id"] for row in chapters}
            if any(not row or row[0] not in current_ids for row in previous["chapters"]):
                raise ArchiveError("the source's chapter set shrank or changed edition; preserving the previous CBZ")
    with tempfile.NamedTemporaryFile(prefix=".suwayomi-", suffix=".tmp", dir=root, delete=False) as temporary:
        staging = Path(temporary.name)
        try:
            with ZipFile(temporary, "w") as output:
                page_count = 0
                for chapter in chapters:
                    page_count += add_chapter_pages(client, output, chapter, page_count + 1)
                output.writestr("ComicInfo.xml", comic_info(manga, volume, page_count))
                output.comment = signature
            temporary.flush()
            os.fsync(temporary.fileno())
            staging.chmod(0o600)
            try:
                folder.mkdir(mode=0o700)
                # Some NAS filesystems apply inherited ACLs instead of the mkdir mode.
                folder.chmod(0o700)
            except FileExistsError:
                pass
            os.replace(staging, destination)
        finally:
            staging.unlink(missing_ok=True)
    logging.info("exported %s in %s (%d pages)", destination.name, folder.name, page_count)
    return True


def run_once(client, root, previous=()):
    mangas = client.downloaded_mangas()
    failures = 0
    exported = 0
    for manga_id, manga in mangas.items():
        try:
            chapters = list(client.manga_chapters(manga_id))
            for volume, selected in complete_volumes(chapters):
                try:
                    exported += archive_volume(client, root, manga, volume, selected, previous)
                except (ArchiveError, OSError, BadZipFile, RuntimeError) as exc:
                    failures += 1
                    logging.error("manga %s volume %s: %s", manga_id, volume, exc)
        except (ArchiveError, KeyError, TypeError, ValueError) as exc:
            failures += 1
            logging.error("manga %s: %s", manga_id, exc)
    logging.log(logging.INFO if exported or failures else logging.DEBUG,
                "%d manga checked, %d CBZ exported, %d failures", len(mangas), exported, failures)
    return failures


def log_download_progress(client, interval):
    previous = {}
    unavailable = False
    while True:
        try:
            queue = client.download_status()["queue"]
            current = {task["chapterId"]: (task["state"], task["percent"]) for task in queue}
            for task in queue:
                if current[task["chapterId"]] != previous.get(task["chapterId"]):
                    logging.info("download %s", json.dumps(task, ensure_ascii=False))
            for chapter_id in previous.keys() - current.keys():
                logging.info("chapter %s left Suwayomi queue; see volume status for CBZ confirmation", chapter_id)
            if unavailable:
                logging.info("Suwayomi download queue is reachable again")
            previous = current
            unavailable = False
        except (ArchiveError, OSError, ValueError, TypeError, KeyError) as exc:
            if not unavailable:
                logging.warning("cannot read Suwayomi download progress: %s", exc)
            unavailable = True
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--connection-file", type=Path, help="Suwayomi connection JSON (optional)")
    parser.add_argument("--interval", type=int, default=0, help="seconds between polls; zero runs once")
    parser.add_argument("--status-port", type=int, help="internal HTTP status port")
    parser.add_argument("--progress-interval", type=int, default=0, help="seconds between download progress checks")
    parser.add_argument("--settings-file", type=Path, default=os.environ.get("LN_DOWNLOAD_FOLDERS_FILE") or None)
    args = parser.parse_args()
    if args.progress_interval and (not args.interval or args.progress_interval < 5):
        parser.error("--progress-interval requires archive polling and a minimum of 5 seconds")
    if args.status_port is not None and (not args.interval or not 1024 <= args.status_port <= 65535):
        parser.error("--status-port requires polling and a port from 1024 to 65535")
    if args.interval and args.interval < 30:
        parser.error("--interval must be zero or at least 30 seconds")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        config = json.loads(args.connection_file.read_text()) if args.connection_file else os.environ
        client = Suwayomi(config)
        args.output.mkdir(parents=True, exist_ok=True)
        with (args.output / ".suwayomi-volume.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for stale in args.output.glob(".suwayomi-*.tmp"):
                stale.unlink()
            if args.status_port:
                start_status_server(client, args.output, args.status_port, args.settings_file)
            if args.progress_interval:
                Thread(target=log_download_progress, args=(client, args.progress_interval), daemon=True).start()
            logging.info("Suwayomi volume exporter started (interval: %ds)", args.interval)
            while True:
                try:
                    current, previous = storage_roots(args.output, args.settings_file)
                    failures = run_once(client, current, previous)
                except (ArchiveError, OSError, ValueError, TypeError, KeyError) as exc:
                    logging.error("export scan failed: %s", exc)
                    failures = 1
                if not args.interval:
                    return int(bool(failures))
                time.sleep(args.interval)
    except (ArchiveError, OSError, ValueError) as exc:
        logging.error("cannot start volume exporter: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
