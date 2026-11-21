"""Expose targeted BangumiKomga conversion on the private Docker network."""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

import requests
from zhconv import convert

from api.bangumi_model import SubjectPlatform
from core.process_metadata import set_komga_book_metadata, set_komga_series_metadata
from tools.resort_search_results_list import compute_name_score_by_fuzzy

PLATFORMS = {"novel": SubjectPlatform.Novel, "manga": SubjectPlatform.Comic}
MAX_RESPONSE = 2 * 1024 * 1024
USER_AGENT = "NovelAndMangaStudio/1.0 (https://github.com/xieqiong111/dsh-plugin-lightnovel)"


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code


class Bangumi:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        token = os.environ.get("BANGUMI_ACCESS_TOKEN", "").strip()
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"
        self.next_request = 0

    def request(self, path, body=None):
        time.sleep(max(0, self.next_request - time.monotonic()))
        self.next_request = time.monotonic() + 0.5
        with self.session.request(
            "GET" if body is None else "POST", "https://api.bgm.tv" + path,
            json=body, timeout=(3, 5), allow_redirects=False, stream=True,
        ) as response:
            status = response.status_code
            if status == 404:
                raise ApiError(404, "BANGUMI_NOT_FOUND", "Bangumi 条目不存在或不可读取。")
            if status in (401, 403):
                raise ApiError(502, "BANGUMI_AUTH_FAILED", "Bangumi 拒绝访问，请检查服务端令牌。")
            if status == 429:
                raise ApiError(429, "BANGUMI_RATE_LIMIT", "Bangumi 请求过于频繁，请稍后重试。")
            if status != 200:
                raise ApiError(502, "BANGUMI_HTTP_ERROR", f"Bangumi 返回 HTTP {status}。")
            data = bytearray()
            for chunk in response.iter_content(chunk_size=16384):
                data.extend(chunk)
                if len(data) > MAX_RESPONSE:
                    raise ApiError(502, "BANGUMI_RESPONSE_TOO_LARGE", "Bangumi 响应超出大小限制。")
            return json.loads(data)

    def get_subject_metadata(self, subject_id):
        return self.request(f"/v0/subjects/{subject_id}")

    def get_related_subjects(self, subject_id):
        return self.request(f"/v0/subjects/{subject_id}/subjects")


def matches(subject, kind, scope):
    return (
        subject["type"] == 1
        and SubjectPlatform.parse(subject["platform"]) == PLATFORMS[kind]
        and subject.get("series") is (scope == "series")
    )


def candidate(subject):
    return {
        "id": subject["id"], "name": subject["name"], "nameCn": subject.get("name_cn") or "",
        "date": subject.get("date"), "summary": (subject.get("summary") or "")[:500],
    }


def search(bangumi, query, kind, scope):
    normalized = convert(query, "zh-cn")
    payload = bangumi.request("/v0/search/subjects?limit=20", {
        "keyword": normalized, "filter": {"type": [1]},
    })
    found = []
    for subject in payload["data"]:
        if matches(subject, kind, scope):
            row = candidate(subject)
            row["score"] = compute_name_score_by_fuzzy(
                convert(row["name"], "zh-cn"), convert(row["nameCn"], "zh-cn"),
                subject.get("infobox") or [], normalized,
            )
            found.append(row)
    return {"candidates": sorted(found, key=lambda row: row["score"], reverse=True)[:10]}


def metadata(bangumi, subject_id, kind, scope):
    subject = bangumi.get_subject_metadata(subject_id)
    if subject.get("id") != subject_id or not matches(subject, kind, scope):
        raise ApiError(422, "BANGUMI_TYPE_MISMATCH", "Bangumi 条目与选择的类型或系列／单册范围不符。")
    for field, default in (("infobox", []), ("tags", []), ("rating", {"score": 0})):
        if subject.get(field) is None:
            subject[field] = default
    if scope == "series":
        converted = set_komga_series_metadata(subject, "", bangumi)
        names = ("title", "summary", "publisher", "alternateTitles", "tags", "links", "ageRating")
    else:
        # Conversion requests this same subject again. Reuse the validated response.
        class BookSource:
            def get_subject_metadata(self, _subject_id):
                return subject

            def get_related_subjects(self, requested_id):
                return bangumi.get_related_subjects(requested_id)

        converted = set_komga_book_metadata(subject_id, 0, "", BookSource())
        names = ("summary", "authors", "releaseDate", "tags", "links")
    patch = {name: getattr(converted, name) for name in names}
    return {"subject": candidate(subject), "metadata": patch}


class Handler(BaseHTTPRequestHandler):
    bangumi = Bangumi()

    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, *_args):
        pass

    def respond(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            path = urlsplit(self.path)
            params = parse_qs(path.query)
            if path.path not in ("/search", "/metadata"):
                raise ApiError(404, "NOT_FOUND", "未知接口。")
            kind = params.get("kind", [""])[0]
            scope = params.get("scope", [""])[0]
            if kind not in PLATFORMS or scope not in ("series", "book"):
                raise ApiError(400, "INVALID_METADATA_TYPE", "请选择小说或漫画，以及系列或单册。")
            if path.path == "/search":
                query = params.get("query", [""])[0].strip()
                if not 1 <= len(query) <= 200:
                    raise ApiError(400, "INVALID_QUERY", "请输入 1 至 200 个字符。")
                result = search(self.bangumi, query, kind, scope)
            else:
                subject_id = params.get("subjectId", [""])[0]
                if not subject_id.isascii() or not subject_id.isdecimal() or not 1 <= len(subject_id) <= 10 or int(subject_id) == 0:
                    raise ApiError(400, "INVALID_SUBJECT_ID", "请填写有效的 Bangumi 条目 ID。")
                result = metadata(self.bangumi, int(subject_id), kind, scope)
            self.respond(200, result)
        except ApiError as error:
            self.respond(error.status, {"error": {"code": error.code, "message": str(error)}})
        except requests.Timeout:
            self.respond(504, {"error": {"code": "BANGUMI_TIMEOUT", "message": "Bangumi 响应超时。"}})
        except (requests.RequestException, ValueError, KeyError, TypeError, AttributeError):
            self.respond(502, {"error": {"code": "BANGUMI_ERROR", "message": "Bangumi 不可用或返回了无法转换的数据。"}})


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8091), Handler).serve_forever()
