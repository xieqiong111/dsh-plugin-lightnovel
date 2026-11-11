import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bili_novel_packer/light_novel/base/light_novel_model.dart';
import 'package:bili_novel_packer/light_novel/base/light_novel_source.dart';
import 'package:html/dom.dart';
import 'package:html/parser.dart';

/// Offline `LightNovelSource` backed by local fixture files.
///
/// It exists so the *real* `NovelPacker` / `EpubPacker` pipeline (chapter
/// restore handling, image embedding, OPF/NCX generation, ZIP assembly) can be
/// exercised in automated tests without touching any third-party website.
/// It is also how the plugin's CI verifies EPUB integrity end to end.
class FixtureLightNovelSource implements LightNovelSource {
  final Directory root;

  FixtureLightNovelSource(String fixturesDir) : root = Directory(fixturesDir);

  @override
  String get name => '离线测试书源';

  @override
  String get sourceUrl => 'fixture://local';

  @override
  bool supportUrl(String url) =>
      url.startsWith('fixture://') || url.startsWith('https://fixture.local/');

  Map<String, dynamic> _readJson(String name) =>
      jsonDecode(File('${root.path}/$name').readAsStringSync())
          as Map<String, dynamic>;

  @override
  Future<Novel> getNovel(String url) async {
    final data = _readJson('novel.json');
    return Novel()
      ..id = data['id'] as String
      ..url = (data['url'] as String?) ?? url
      ..title = data['title'] as String
      ..alias = data['alias'] as String?
      ..author = data['author'] as String
      ..status = data['status'] as String
      ..coverUrl = data['coverUrl'] as String?
      ..tags = (data['tags'] as List<dynamic>?)?.cast<String>()
      ..publisher = data['publisher'] as String?
      ..description = data['description'] as String?;
  }

  @override
  Future<Catalog> getNovelCatalog(Novel novel) async {
    final list = jsonDecode(
      File('${root.path}/catalog.json').readAsStringSync(),
    ) as List<dynamic>;
    final catalog = Catalog(novel);
    for (final raw in list) {
      final item = raw as Map<String, dynamic>;
      final volume = Volume(item['name'] as String, catalog);
      volume.cover = item['cover'] as String?;
      final chapters = (item['chapters'] as List<dynamic>? ?? const []);
      for (final rawChapter in chapters) {
        final c = rawChapter as Map<String, dynamic>;
        volume.chapters.add(
          Chapter(
            c['name'] as String,
            'fixture://chapter/${c['file'] as String}',
            volume,
          ),
        );
      }
      catalog.volumes.add(volume);
    }
    return catalog;
  }

  @override
  Future<Document> getNovelChapter(Chapter chapter) async {
    final doc = Document.html(LightNovelSource.html);
    final uri = Uri.parse(chapter.chapterUrl ?? '');
    final relative = uri.path.replaceFirst(RegExp(r'^/'), '');
    final file = File('${root.path}/$relative');
    if (!file.existsSync()) {
      throw StateError('fixture chapter missing: ${file.path}');
    }
    final fragment = parseFragment(file.readAsStringSync());
    for (final node in fragment.nodes.toList()) {
      doc.body!.append(node);
    }
    return doc;
  }

  @override
  Future<Uint8List> getImage(String url) async {
    if (url.startsWith('data:image')) {
      return base64.decode(url.split(',').last);
    }
    final uri = Uri.parse(url);
    final relative = uri.hasScheme && uri.scheme == 'fixture'
        ? uri.path.replaceFirst(RegExp(r'^/'), '')
        : url;
    final candidate = relative.startsWith('chapters/')
        ? '${root.path}/$relative'
        : '${root.path}/images/$relative';
    final file = File(candidate);
    if (!file.existsSync()) return Uint8List(0);
    return file.readAsBytesSync();
  }
}
