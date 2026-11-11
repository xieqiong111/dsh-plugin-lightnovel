import 'dart:io';

/// Minimal additive patch for the headless adapter.
///
/// The interactive CLI writes to stdout. The headless entry point uses stdout as
/// its NDJSON protocol channel, so it swaps [Console.out] to stderr before any
/// original code runs. Default behaviour is byte-for-byte identical to upstream.
class Console {
  const Console();

  /// Where human-facing messages go. Headless mode sets this to [stderr].
  static StringSink out = stdout;

  void write(String msg) {
    out.write(msg);
  }

  void writeLine([Object? msg = ""]) {
    out.writeln(msg);
  }

  String? readLine() {
    return stdin.readLineSync();
  }
}

const console = Console();
