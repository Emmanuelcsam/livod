const path = require('path');
const fs = require('fs/promises');
const { pathExists, readJson } = require('../shared/fs');

const DEFAULT_IGNORE = [
  'node_modules',
  'node_modules/**',
  '.git',
  '.git/**',
  '.livod',
  '.livod/**',
  'dist',
  'dist/**',
  'build',
  'build/**',
  'coverage',
  'coverage/**',
  '.next',
  '.next/**',
  'out',
  'out/**',
  '.cache',
  '.cache/**',
  'tmp',
  'tmp/**',
  'temp',
  'temp/**'
];

const DEFAULTS = {
  watch: ['**/*'],
  ignore: DEFAULT_IGNORE,
  commands: [],
  debounceMs: 250,
  parallel: true,
  restartOnChange: true,
  linkNodeModules: true,
  applyRequiresSuccess: true,
  pruneOnApply: false,
  ai: {
    enabled: true,
    verbose: true,
    journal: true,
    includeOutputs: true,
    maxFileBytes: 512 * 1024,
    maxDiffBytes: 128 * 1024,
    maxOutputBytes: 32 * 1024,
    baseline: true,
    intentNotes: true,
    scanAllOnDirChange: true,
    compact: {
      enabled: true,
      maxDiffLines: 80,
      maxStdoutLines: 20,
      maxStderrLines: 60
    }
  },
  ollama: {
    enabled: false,
    model: 'llama3.2:3b',
    temperature: 0.2,
    systemPrompt: 'You are a helpful coding assistant. Use the provided context and propose minimal, safe changes.',
    auto: false,
    autoOnSuccessOnly: false,
    context: 'compact',
    maxPromptChars: 20000
  }
};

async function detectDefaultCommands(repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (await pathExists(pkgPath)) {
    try {
      const pkg = await readJson(pkgPath);
      const scripts = (pkg && pkg.scripts) || {};
      if (scripts.build) return [{ name: 'build', cmd: 'npm run build' }];
      if (scripts.compile) return [{ name: 'compile', cmd: 'npm run compile' }];
      if (scripts.test) return [{ name: 'test', cmd: 'npm test' }];
      if (scripts.lint) return [{ name: 'lint', cmd: 'npm run lint' }];
    } catch {
      // ignore
    }
  }

  const makefilePath = path.join(repoRoot, 'Makefile');
  if (await pathExists(makefilePath)) {
    return [{ name: 'make', cmd: 'make' }];
  }

  return [{ name: 'noop', cmd: 'echo "No build command configured. Add livod.config.json"' }];
}

async function resolveConfigPath(repoRoot, explicitPath) {
  if (explicitPath) return path.resolve(repoRoot, explicitPath);

  const candidates = ['livod.config.json', '.livodrc.json'];
  for (const name of candidates) {
    const full = path.join(repoRoot, name);
    if (await pathExists(full)) return full;
  }

  const pkgPath = path.join(repoRoot, 'package.json');
  if (await pathExists(pkgPath)) return pkgPath;

  return null;
}

async function loadConfig(repoRoot, options = {}) {
  const configPath = await resolveConfigPath(repoRoot, options.configPath);
  let userConfig = {};
  let configSource = null;

  if (configPath) {
    try {
      if (path.basename(configPath) === 'package.json') {
        const pkg = await readJson(configPath);
        if (pkg && pkg.livod) {
          userConfig = pkg.livod;
          configSource = configPath;
        }
      } else {
        userConfig = await readJson(configPath);
        configSource = configPath;
      }
    } catch {
      // ignore invalid config
    }
  }

  const defaults = { ...DEFAULTS };
  defaults.commands = await detectDefaultCommands(repoRoot);

  const merged = {
    ...defaults,
    ...userConfig,
    watch: userConfig.watch ?? defaults.watch,
    ignore: userConfig.ignore ?? defaults.ignore,
    commands: userConfig.commands ?? defaults.commands,
    ai: {
      ...defaults.ai,
      ...(userConfig.ai || {}),
      compact: {
        ...defaults.ai.compact,
        ...((userConfig.ai && userConfig.ai.compact) || {})
      }
    },
    ollama: {
      ...defaults.ollama,
      ...(userConfig.ollama || {})
    }
  };

  if (options.parallel !== undefined) merged.parallel = options.parallel;
  if (options.restartOnChange !== undefined) merged.restartOnChange = options.restartOnChange;
  if (options.debounceMs !== undefined) merged.debounceMs = options.debounceMs;
  if (options.linkNodeModules !== undefined) merged.linkNodeModules = options.linkNodeModules;
  if (options.applyRequiresSuccess !== undefined) merged.applyRequiresSuccess = options.applyRequiresSuccess;
  if (options.pruneOnApply !== undefined) merged.pruneOnApply = options.pruneOnApply;
  if (options.aiEnabled !== undefined) merged.ai = { ...merged.ai, enabled: options.aiEnabled };
  if (options.ollamaEnabled !== undefined) merged.ollama = { ...merged.ollama, enabled: options.ollamaEnabled };
  if (options.ollamaModel !== undefined) merged.ollama = { ...merged.ollama, model: options.ollamaModel };
  if (options.ollamaAuto !== undefined) merged.ollama = { ...merged.ollama, auto: options.ollamaAuto };
  if (options.ollamaAutoOnSuccessOnly !== undefined) {
    merged.ollama = { ...merged.ollama, autoOnSuccessOnly: options.ollamaAutoOnSuccessOnly };
  }
  if (options.ollamaContext !== undefined) merged.ollama = { ...merged.ollama, context: options.ollamaContext };
  if (options.ollamaTemperature !== undefined) merged.ollama = { ...merged.ollama, temperature: options.ollamaTemperature };
  if (options.ollamaSystemPrompt !== undefined) merged.ollama = { ...merged.ollama, systemPrompt: options.ollamaSystemPrompt };

  if (!Array.isArray(merged.commands) || merged.commands.length === 0) {
    merged.commands = defaults.commands;
  }

  merged.commands = merged.commands.map((entry, index) => {
    if (typeof entry === 'string') {
      return { name: `cmd${index + 1}`, cmd: entry };
    }
    return {
      name: entry.name || `cmd${index + 1}`,
      cmd: entry.cmd,
      cwd: entry.cwd
    };
  }).filter((entry) => entry.cmd);

  return { config: merged, configSource };
}

async function writeSampleConfig(repoRoot) {
  const target = path.join(repoRoot, 'livod.config.json');
  if (await pathExists(target)) return { path: target, created: false };
  const sample = {
    watch: ['**/*'],
    ignore: DEFAULT_IGNORE,
    commands: [
      { name: 'build', cmd: 'npm run build' }
    ],
    debounceMs: 250,
    parallel: true,
    restartOnChange: true,
    linkNodeModules: true,
    ai: {
      enabled: true,
      verbose: true,
      compact: {
        enabled: true
      }
    },
    ollama: {
      enabled: false,
      model: 'llama3.2:3b',
      auto: false
    }
  };
  await fs.writeFile(target, JSON.stringify(sample, null, 2));
  return { path: target, created: true };
}

module.exports = {
  DEFAULT_IGNORE,
  loadConfig,
  writeSampleConfig
};
