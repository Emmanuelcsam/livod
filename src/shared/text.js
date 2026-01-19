function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

function tailLines(text, maxLines) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return lines.slice(lines.length - maxLines).join('\n');
}

function headLines(text, maxLines) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n');
}

function truncateChars(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

module.exports = {
  formatDuration,
  tailLines,
  headLines,
  truncateChars
};
