const path = require('path');
const fs = require('fs/promises');
const {
  makeIgnoreMatcher,
  ensureDir,
  walkDir,
  pathExists,
  readJson
} = require('../shared/fs');

async function readStatus(sandboxRoot) {
  const statusPath = path.join(sandboxRoot, '.livod', 'status.json');
  if (!(await pathExists(statusPath))) return null;
  try {
    return await readJson(statusPath);
  } catch {
    return null;
  }
}

async function syncDir(srcRoot, destRoot, ignoreMatcher, { prune } = {}) {
  const seen = new Set();

  await walkDir(srcRoot, ignoreMatcher, async ({ full, rel, dirent }) => {
    if (!rel) return;
    seen.add(rel);
    const destPath = path.join(destRoot, rel);

    if (dirent.isDirectory()) {
      await ensureDir(destPath);
      return;
    }

    if (dirent.isSymbolicLink()) {
      const linkTarget = await fs.readlink(full);
      await ensureDir(path.dirname(destPath));
      await fs.rm(destPath, { force: true, recursive: true });
      await fs.symlink(linkTarget, destPath);
      return;
    }

    if (dirent.isFile()) {
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(full, destPath);
    }
  }, srcRoot);

  if (!prune) return;

  async function pruneDir(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(destRoot, full);
      if (ignoreMatcher(rel)) continue;
      if (!seen.has(rel)) {
        await fs.rm(full, { recursive: true, force: true });
        continue;
      }
      if (entry.isDirectory()) {
        await pruneDir(full);
      }
    }
  }

  await pruneDir(destRoot);
}

async function applySandbox({ sandboxRoot, repoRoot, config, requireSuccess, prune }) {
  const metaPath = path.join(sandboxRoot, '.livod', 'meta.json');
  let meta = null;
  if (await pathExists(metaPath)) {
    try {
      meta = await readJson(metaPath);
    } catch {
      meta = null;
    }
  }

  const targetRoot = meta && meta.sourceRoot ? meta.sourceRoot : repoRoot;

  if (requireSuccess) {
    const status = await readStatus(sandboxRoot);
    if (!status || !status.lastRunOk) {
      const reason = status ? 'Last run failed or was interrupted.' : 'No successful run recorded.';
      throw new Error(`Refusing to apply changes. ${reason}`);
    }
  }

  const ignoreMatcher = makeIgnoreMatcher(config.ignore || []);
  const shouldIgnore = (rel) => {
    if (rel === '.livod' || rel.startsWith(`.livod${path.sep}`)) return true;
    if (rel === '.git' || rel.startsWith(`.git${path.sep}`)) return true;
    return ignoreMatcher(rel);
  };

  await syncDir(sandboxRoot, targetRoot, shouldIgnore, { prune });

  return { targetRoot };
}

module.exports = {
  applySandbox
};
