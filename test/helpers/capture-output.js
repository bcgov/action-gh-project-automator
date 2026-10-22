// Runs fn with stdout and stderr captured, so warnings a test triggers on purpose
// stay out of CI logs. Retry back-off is skipped to keep failure tests fast.
// Returns everything written, for assertions.
export async function captureOutput(fn) {
  const written = [];
  const capture = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  const { write: stdoutWrite } = process.stdout;
  const { write: stderrWrite } = process.stderr;
  const originalSetTimeout = globalThis.setTimeout;
  process.stdout.write = capture;
  process.stderr.write = capture;
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
