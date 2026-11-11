/// Additive hooks consumed by the non-interactive headless entry point.
///
/// Upstream `NovelPacker` keeps all of its original scraping, chapter-restore,
/// image and EPUB logic. These hooks only expose progress/cancellation points so
/// the plugin can report per-chapter progress and cancel long downloads.
library;

/// Emits one NDJSON-serialisable progress event.
typedef NovelPackerEventSink = void Function(Map<String, dynamic> event);

/// Returns true when the current job has been cancelled.
typedef NovelPackerCancelCheck = bool Function();

class NovelPackerHooks {
  final NovelPackerEventSink? emit;
  final NovelPackerCancelCheck? isCancelled;

  const NovelPackerHooks({this.emit, this.isCancelled});

  void progress(Map<String, dynamic> event) => emit?.call(event);

  /// Throws [NovelPackerCancelled] when the caller requested cancellation.
  void checkCancelled() {
    if (isCancelled?.call() ?? false) {
      throw const NovelPackerCancelled();
    }
  }
}

/// Raised at a safe boundary (between chapters / volumes) when cancelled.
class NovelPackerCancelled implements Exception {
  const NovelPackerCancelled();

  @override
  String toString() => 'NovelPackerCancelled: job was cancelled';
}
