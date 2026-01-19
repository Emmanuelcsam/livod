const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const picomatch = require('picomatch');

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content);
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function makeIgnoreMatcher(patterns = []) {
  const matchers = patterns.map((pattern) => picomatch(pattern, { dot: true }));
  return (relPath) => {
    const rel = toPosix(relPath);
    if (!rel || rel === '.') return false;
    return matchers.some((match) => match(rel));
  };
}

async function copyDir(src, dest, ignoreMatcher) {
  await ensureDir(dest);
  const srcResolved = path.resolve(src);
  const destResolved = path.resolve(dest);
  const inside = destResolved === srcResolved || destResolved.startsWith(`${srcResolved}${path.sep}`);

  if (!inside) {
    await fs.cp(src, dest, {
      recursive: true,
      dereference: false,
      filter: (srcPath) => {
        const rel = path.relative(src, srcPath);
        if (!rel || rel === '') return true;
        return !ignoreMatcher(rel);
      }
    });
    return;
  }

  await walkDir(src, ignoreMatcher, async ({ full, rel, dirent }) => {
    const destPath = path.join(dest, rel);
    if (dirent.isDirectory()) {
      await ensureDir(destPath);
      return;
    }
    await ensureDir(path.dirname(destPath));
    if (dirent.isSymbolicLink()) {
      const linkTarget = await fs.readlink(full);
      await fs.rm(destPath, { force: true, recursive: true });
      await fs.symlink(linkTarget, destPath);
      return;
    }
    if (dirent.isFile()) {
      await fs.copyFile(full, destPath);
    }
  });
}

async function walkDir(root, ignoreMatcher, onEntry, base = root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const rel = path.relative(base, full);
    if (ignoreMatcher(rel)) continue;
    await onEntry({ full, rel, dirent: entry });
    if (entry.isDirectory()) {
      await walkDir(full, ignoreMatcher, onEntry, base);
    }
  }
}

async function removeDir(dirPath) {
  if (!(await pathExists(dirPath))) return;
  await fs.rm(dirPath, { recursive: true, force: true });
}

function isFileSync(filePath) {
  try {
    return fssync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

module.exports = {
  pathExists,
  ensureDir,
  readJson,
  writeJson,
  makeIgnoreMatcher,
  copyDir,
  walkDir,
  removeDir,
  isFileSync
};
