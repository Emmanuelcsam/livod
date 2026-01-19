function createLogger({ prefix = '[livod]', quiet = false, debug = false } = {}) {
  const write = (stream, message, tag) => {
    if (quiet) return;
    const line = tag ? `${tag} ${message}` : message;
    stream.write(`${prefix} ${line}\n`);
  };

  return {
    info: (message) => write(process.stdout, message),
    warn: (message) => write(process.stderr, message, 'WARN:'),
    error: (message) => write(process.stderr, message, 'ERROR:'),
    debug: (message) => {
      if (debug) write(process.stdout, message, 'DEBUG:');
    },
    line: (message) => write(process.stdout, message),
    lineError: (message) => write(process.stderr, message)
  };
}

module.exports = {
  createLogger
};
