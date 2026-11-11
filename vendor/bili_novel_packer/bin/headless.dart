/// Non-interactive entry point for DeepSeek Harness `dsh-plugin-lightnovel`.
///
/// It reuses the upstream `LightNovelSource` implementations (bilinovel / wenku8)
/// and the upstream `NovelPacker` + `EpubPacker` (chapter restore, image
/// embedding, OPF/NCX/nav generation, ZIP assembly) without reimplementing any
/// of them. The only changes to upstream code are additive progress/cancel
/// hooks and a swappable console sink.
///
/// Protocol: newline-delimited JSON on **stdout**. Human-facing output from the
/// original CLI is redirected to stderr. Exactly one terminal line is emitted:
///   {"type":"result", ...}   on success
///   {"type":"error",  ...}   on failure / cancellation
///
/// Commands (angle brackets below are placeholders):
///   `details  --source ID --url URL [--fixtures DIR]`
///   `volumes  --source ID --url URL [--fixtures DIR]`
///   `pack     --source ID --url URL --output-dir ABS`
///            `--volumes all|1,2|NAME [--combine] [--add-chapter-title]`
///            `[--fixtures DIR] [--cancel-file PATH]`
///            `[--allowed-sources bilinovel,wenku8,fixture]`
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bili_novel_packer/console/console.dart';
import 'package:bili_novel_packer/headless/fixture_source.dart';
import 'package:bili_novel_packer/headless/packer_hooks.dart';
import 'package:bili_novel_packer/light_novel/base/light_novel_model.dart';
import 'package:bili_novel_packer/light_novel/base/light_novel_source.dart';
import 'package:bili_novel_packer/light_novel/bili_novel/bili_novel_source.dart';
import 'package:bili_novel_packer/light_novel/wenku_novel/wenku_novel_source.dart';
import 'package:bili_novel_packer/novel_packer.dart';
import 'package:bili_novel_packer/pack_option.dart';
import 'package:path/path.dart' as p;

const String headlessVersion = '1.0.0';

/// Sources that do not require an authenticated session. Anything not listed
/// here is refused for `pack` unless explicitly allowed by the caller.
const Set<String> _publicSources = {'bilinovel', 'fixture'};

bool _cancelled = false;
File? _cancelFile;
final List<StreamSubscription<ProcessSignal>> _signalSubscriptions = [];

/// A structured failure that `main` turns into one NDJSON `error` line.
///
/// Throwing (instead of calling `exit` inline) keeps helpers such as
/// `_resolveSource` and `_selectVolumes` pure and lets `main` own the single
/// flush-then-exit path.
class HeadlessFailure implements Exception {
  final String code;
  final String message;
  final int exitCode;

  HeadlessFailure(this.code, this.message, {this.exitCode = 1});
}

void _emit(Map<String, dynamic> event) {
  stdout.writeln(jsonEncode(<String, dynamic>{
    'ts': DateTime.now().toUtc().toIso8601String(),
    ...event,
  }));
}

/// Emit one terminal line, flush the pipe, then terminate immediately.
///
/// This is essential: `ProcessSignal.watch()` keeps an isolate alive forever,
/// so returning from `main` would leave every completed download task holding
/// a zombie Dart process. `exit()` after `flush()` is the only reliable way to
/// both deliver the result byte-for-byte and release the process.
Future<Never> _terminate(Map<String, dynamic> event, int code) async {
  _emit(event);
  try {
    await stdout.flush();
  } catch (_) {
    // The consumer may have closed the pipe; nothing left to do.
  }
  for (final sub in _signalSubscriptions) {
    await sub.cancel().catchError((_) {});
  }
  _signalSubscriptions.clear();
  exit(code);
}

Never _fail(String code, String message, {int exitCode = 1}) {
  throw HeadlessFailure(code, message, exitCode: exitCode);
}

Map<String, String> _parseArgs(List<String> argv) {
  final result = <String, String>{};
  for (var i = 0; i < argv.length; i++) {
    final token = argv[i];
    if (!token.startsWith('--')) continue;
    final key = token.substring(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[key] = argv[++i];
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

bool _flag(Map<String, String> args, String key) =>
    (args[key] ?? 'false').toLowerCase() == 'true';

bool _isCancelled() {
  if (_cancelled) return true;
  if (_cancelFile != null && _cancelFile!.existsSync()) {
    _cancelled = true;
    return true;
  }
  return false;
}

LightNovelSource _resolveSource(String requested, String url, String fixturesDir,
    Set<String> allowed) {
  final sources = <String, LightNovelSource>{
    'bilinovel': BiliNovelSource(),
    'wenku8': WenkuNovelSource(),
    'fixture': FixtureLightNovelSource(fixturesDir),
  };
  final id = requested == 'auto'
      ? sources.keys.firstWhere(
          (key) => sources[key]!.supportUrl(url),
          orElse: () => '',
        )
      : requested;
  if (id.isEmpty || !sources.containsKey(id)) {
    _fail('UNSUPPORTED_SOURCE', 'Unsupported or undetectable source: $requested ($url)');
  }
  if (!allowed.contains(id)) {
    _fail('SOURCE_DISABLED',
        'Source "$id" is disabled by configuration; enabled: ${allowed.toList()..sort()}');
  }
  return sources[id]!;
}

Map<String, dynamic> _novelToJson(Novel n, String sourceId, String sourceName) => <String, dynamic>{
      'id': n.id,
      'title': n.title,
      'alias': n.alias,
      'author': n.author,
      'status': n.status,
      'coverUrl': n.coverUrl,
      'tags': n.tags ?? <String>[],
      'publisher': n.publisher,
      'description': n.description,
      'url': n.url,
      'sourceId': sourceId,
      'source': sourceName,
    };

Map<String, dynamic> _catalogToJson(Catalog catalog) => <String, dynamic>{
      'volumes': [
        for (var i = 0; i < catalog.volumes.length; i++)
          <String, dynamic>{
            'index': i + 1,
            'name': catalog.volumes[i].volumeName,
            'cover': catalog.volumes[i].cover,
            'chapterCount': catalog.volumes[i].chapters.length,
            'chapters': [
              for (final c in catalog.volumes[i].chapters)
                <String, dynamic>{'name': c.chapterName, 'url': c.chapterUrl},
            ],
          },
      ],
    };

List<Volume> _selectVolumes(Catalog catalog, String selector) {
  if (selector == 'all' || selector.trim().isEmpty) {
    return catalog.volumes.toList();
  }
  final picked = <Volume>{};
  for (final part in selector.split(',')) {
    final token = part.trim();
    if (token.isEmpty) continue;
    final index = int.tryParse(token);
    if (index != null) {
      if (index < 1 || index > catalog.volumes.length) {
        _fail('INVALID_VOLUME', 'Volume index out of range: $index');
      }
      picked.add(catalog.volumes[index - 1]);
      continue;
    }
    final match = catalog.volumes.where((v) => v.volumeName == token).toList();
    if (match.isEmpty) {
      _fail('INVALID_VOLUME', 'No volume named: $token');
    }
    picked.add(match.first);
  }
  // Preserve catalogue order regardless of the order supplied by the caller.
  return catalog.volumes.where(picked.contains).toList();
}

Future<void> main(List<String> argv) async {
  // Keep stdout exclusively for the NDJSON protocol.
  Console.out = stderr;

  try {
    _signalSubscriptions.add(
      ProcessSignal.sigterm.watch().listen((_) => _cancelled = true),
    );
    _signalSubscriptions.add(
      ProcessSignal.sigint.watch().listen((_) => _cancelled = true),
    );
  } catch (_) {
    // Windows or a restricted runtime: the cancel-file sentinel still works.
  }

  try {
    await _run(argv);
  } on HeadlessFailure catch (failure) {
    await _terminate(<String, dynamic>{
      'type': 'error',
      'ok': false,
      'code': failure.code,
      'message': failure.message,
    }, failure.exitCode);
  } on NovelPackerCancelled catch (_) {
    await _terminate(<String, dynamic>{
      'type': 'error',
      'ok': false,
      'code': 'CANCELLED',
      'message': 'Download cancelled by user',
    }, 1);
  } catch (error, stack) {
    stderr.writeln('[headless] $error');
    stderr.writeln(stack);
    await _terminate(<String, dynamic>{
      'type': 'error',
      'ok': false,
      'code': 'PACK_FAILED',
      'message': error.toString(),
    }, 1);
  }
}

/// Returns the terminal event for `main` to emit, or throws a HeadlessFailure.
Future<void> _run(List<String> argv) async {
  if (argv.isEmpty) {
    _fail('BAD_REQUEST', 'Missing command (details|volumes|pack)');
  }
  final command = argv.first;
  final args = _parseArgs(argv.sublist(1));
  final fixturesDir = args['fixtures'] ?? '';
  final url = args['url'] ?? '';
  final requestedSource = args['source'] ?? 'auto';
  final allowed = (args['allowed-sources'] ?? 'bilinovel,fixture')
      .split(',')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toSet();
  final cancelFilePath = args['cancel-file'];
  if (cancelFilePath != null) _cancelFile = File(cancelFilePath);

  // Deliberately conservative: never supply credentials, cookies or paid
  // access. wenku8 novel pages may require a login; unless an operator
  // explicitly enables it we refuse to even try.
  final requirePublic = _flag(args, 'require-public-sources');
  if (requirePublic) allowed.removeWhere((s) => !_publicSources.contains(s));

  _emit(<String, dynamic>{
    'type': 'start',
    'command': command,
    'version': headlessVersion,
    'source': requestedSource,
  });

  if (url.isEmpty) _fail('BAD_REQUEST', 'Missing --url');

  final source = _resolveSource(requestedSource, url, fixturesDir, allowed);
  final sourceId = requestedSource == 'auto'
      ? (source is FixtureLightNovelSource
          ? 'fixture'
          : source is BiliNovelSource
              ? 'bilinovel'
              : 'wenku8')
      : requestedSource;

  if (command == 'details') {
    final novel = await source.getNovel(url);
    await _terminate(<String, dynamic>{
      'type': 'result',
      'ok': true,
      'command': 'details',
      'data': <String, dynamic>{'novel': _novelToJson(novel, sourceId, source.name)},
    }, 0);
  }

  if (command == 'volumes') {
    final novel = await source.getNovel(url);
    final catalog = await source.getNovelCatalog(novel);
    await _terminate(<String, dynamic>{
      'type': 'result',
      'ok': true,
      'command': 'volumes',
      'data': <String, dynamic>{
        'novel': _novelToJson(novel, sourceId, source.name),
        ..._catalogToJson(catalog),
      },
    }, 0);
  }

  if (command == 'pack') {
    final outputDir = args['output-dir'] ?? '';
    if (outputDir.isEmpty || !p.isAbsolute(outputDir)) {
      _fail('BAD_REQUEST', '--output-dir must be an absolute path');
    }
    Directory(outputDir).createSync(recursive: true);
    Directory.current = outputDir;

    final novel = await source.getNovel(url);
    final catalog = await source.getNovelCatalog(novel);
    final selected = _selectVolumes(catalog, args['volumes'] ?? 'all');
    if (selected.isEmpty) _fail('INVALID_VOLUME', 'No volumes selected');

    final combine = _flag(args, 'combine') && selected.length > 1;
    final option = PackOption.all(
      addChapterTitle: _flag(args, 'add-chapter-title'),
      selectedVolumes: selected,
    );

    final hooks = NovelPackerHooks(
      emit: (event) => _emit(<String, dynamic>{'type': 'progress', ...event}),
      isCancelled: _isCancelled,
    );
    final packer = NovelPacker(source, hooks: hooks);
    final artifacts = <Map<String, dynamic>>[];

    if (combine) {
      final path = await packer.packCombine(source: source, novel: novel, option: option);
      artifacts.add(<String, dynamic>{
        'path': path,
        'volumes': selected.length,
        'chapters': selected.fold<int>(0, (s, v) => s + v.chapters.length),
        'volumeNames': selected.map((v) => v.volumeName).toList(),
        'bytes': File(path).lengthSync(),
      });
    } else {
      for (final volume in selected) {
        final path = await packer.packVolume(source: source, volume: volume, option: option);
        artifacts.add(<String, dynamic>{
          'path': path,
          'volumes': 1,
          'volumeNames': <String>[volume.volumeName],
          'chapters': volume.chapters.length,
          'bytes': File(path).lengthSync(),
        });
      }
    }

    await _terminate(<String, dynamic>{
      'type': 'result',
      'ok': true,
      'command': 'pack',
      'data': <String, dynamic>{
        'novel': _novelToJson(novel, sourceId, source.name),
        'combined': combine,
        'requestedVolumes': selected.length,
        'downloadedVolumes': artifacts.length,
        'downloadedChapters': artifacts.fold<int>(0, (s, a) => s + (a['chapters'] as int)),
        'artifacts': artifacts,
      },
    }, 0);
  }

  _fail('BAD_REQUEST', 'Unknown command: $command');
}
