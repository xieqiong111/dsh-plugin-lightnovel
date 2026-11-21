from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from archive import ArchiveError, Suwayomi, archive_volume, complete_volumes, volume_catalog, volume_label


def chapter(chapter_id, name, downloaded=True, page_count=3):
    return {"id": chapter_id, "name": name, "isDownloaded": downloaded, "pageCount": page_count}


class FakeSuwayomi:
    def __init__(self):
        self.calls = []

    def chapter_zip(self, chapter_id, output):
        self.calls.append(chapter_id)
        with ZipFile(output, "w") as archive:
            for index in [10, 2, 1]:
                archive.writestr(f"pages/{index}.jpg", bytes([chapter_id, index]))
            archive.writestr("ComicInfo.xml", "<ComicInfo/>")
        output.seek(0)


class VolumeArchiveTests(unittest.TestCase):
    def test_volumes_require_explicit_labels(self):
        self.assertEqual(volume_label("第１２卷"), (12, None))
        self.assertEqual(volume_label("Vol. 8 - Chapter 14.5"), (8, Decimal("14.5")))
        self.assertIsNone(volume_label("第12话"))
        self.assertIsNone(volume_label("画集：第1卷"))
        self.assertIsNone(volume_label("第1卷预告"))

    def test_incomplete_volumes_and_duplicate_chapters(self):
        first = chapter(5, "第1卷 第1话")
        second = chapter(6, "第1卷 第2话", downloaded=False)
        whole = chapter(8, "第2卷")
        unrelated = chapter(9, "第3话")
        duplicate_a = chapter(10, "第3卷 第1话")
        duplicate_b = chapter(11, "第3卷 第1话")
        with self.assertLogs(level="WARNING"):
            self.assertEqual(list(complete_volumes([unrelated, first, second, whole, duplicate_a, duplicate_b])), [(2, [whole])])
        second["isDownloaded"] = True
        self.assertEqual(list(complete_volumes([whole, second, first])), [(1, [first, second]), (2, [whole])])

    def test_export_orders_pages_and_separates_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = FakeSuwayomi()
            a = {"id": 17, "sourceId": "99", "title": "試/作"}
            b = {"id": 18, "sourceId": "100", "title": "試/作"}
            chapters = [chapter(3, "第2卷 第2话"), chapter(4, "第2卷 第3话")]
            self.assertTrue(archive_volume(client, root, a, 2, chapters))
            self.assertFalse(archive_volume(client, root, {**a, "title": "別名"}, 2, chapters))
            self.assertTrue(archive_volume(client, root, b, 2, chapters))
            self.assertEqual(client.calls, [3, 4, 3, 4])
            self.assertEqual(len(list(root.glob("*/*.cbz"))), 2)
            with ZipFile(root / "試_作 [99-17]" / "第02卷.cbz") as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual([archive.read(f"{i:06}.jpg") for i in range(1, 7)],
                                 [bytes([ch, i]) for ch in (3, 4) for i in (1, 2, 10)])
                xml = ElementTree.fromstring(archive.read("ComicInfo.xml"))
                self.assertEqual(xml.findtext("Number"), "2")
                self.assertEqual(xml.findtext("PageCount"), "6")

    def test_catalog_reports_written_cbz_and_groups_missing_chapters(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = FakeSuwayomi()
            manga = {"id": 1, "sourceId": "2", "title": "樣本"}
            one = chapter(10, "第1卷")
            two = chapter(11, "第2卷 第5话", downloaded=False)
            three = chapter(12, "第2卷 第6话", downloaded=False)
            archive_volume(client, root, manga, 1, [one])
            with patch.object(client, "manga", return_value=manga, create=True), patch.object(
                client, "manga_chapters", return_value=[three, one, two], create=True
            ):
                catalog = volume_catalog(client, root, 1)
            self.assertEqual(catalog["volumes"], [
                {"number": 1, "chapterIds": ["10"], "downloaded": 1, "filename": "第01卷.cbz"},
                {"number": 2, "chapterIds": ["11", "12"], "downloaded": 0, "filename": None},
            ])

    def test_download_status_uses_upstream_numbers_and_keeps_unknown_progress(self):
        client = Suwayomi({"SUWAYOMI_URL": "http://suwayomi:4567"})
        with patch.object(client, "graphql", return_value={"downloadStatus": {"state": "STARTED", "queue": [
            {"state": "DOWNLOADING", "progress": 0.38, "chapter": {"id": 31, "mangaId": 22, "name": "第2卷"}},
            {"state": "QUEUED", "progress": None, "chapter": {"id": 32, "mangaId": 22, "name": "第3卷"}},
        ]}}):
            result = client.download_status()
        self.assertEqual(result["queue"][0]["percent"], 38)
        self.assertIsNone(result["queue"][1]["percent"])

    def test_failed_refresh_preserves_existing_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = FakeSuwayomi()
            manga = {"id": 1, "sourceId": "2", "title": "樣本"}
            old = chapter(10, "第1卷 第1话")
            archive_volume(client, root, manga, 1, [old])
            artifact = next(root.glob("*/*.cbz"))
            original = artifact.read_bytes()
            bad = chapter(11, "第1卷 第2话", page_count=4)
            with self.assertRaisesRegex(ArchiveError, "expected 4"):
                archive_volume(client, root, manga, 1, [old, bad])
            self.assertEqual(artifact.read_bytes(), original)
            self.assertEqual(list(root.glob(".suwayomi-*")), [])

    def test_truncated_zip_leaves_no_library_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = FakeSuwayomi()
            manga = {"id": 1, "sourceId": "2", "title": "樣本"}
            def corrupt(_id, output):
                output.write(b"not-a-cbz")
                output.seek(0)
            with patch.object(client, "chapter_zip", corrupt):
                with self.assertRaises(BadZipFile):
                    archive_volume(client, root, manga, 1, [chapter(7, "第1卷")])
            self.assertEqual(list(root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
