// Runs fn with stdout and stderr captured, so warnings a test triggers on purpose
// stay out of CI logs. Retry back-off is skipped to keep failure tests fast.
// Returns everything written, for assertions. Only text is captured: the test
// runner sends its results to stdout as Buffers, and those must still get through.
export async function captureOutput(fn) {
  const written = [];
  const { write: stdoutWrite } = process.stdout;
  const { write: stderrWrite } = process.stderr;
  const capture = (stream, write) =>
    function (chunk, ...rest) {
      if (typeof chunk !== 'string') return write.call(stream, chunk, ...rest);
      written.push(chunk);
      return true;
    };
  const originalSetTimeout = globalThis.setTimeout;
  process.stdout.write = capture(process.stdout, stdoutWrite);
  process.stderr.write = capture(process.stderr, stderrWrite);
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  try {
    await fn();
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    globalThis.setTimeout = originalSetTimeout;
  }
  return written.join('');
}
