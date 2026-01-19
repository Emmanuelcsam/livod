const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { exportContext } = require('../core/ai');
const { ensureDir } = require('../shared/fs');
const { truncateChars } = require('../shared/text');

function ollamaPaths(sandboxRoot) {
  const root = path.join(sandboxRoot, '.livod', 'ai', 'ollama');
  return {
    root,
    lastPromptPath: path.join(root, 'last_prompt.md'),
    lastResponsePath: path.join(root, 'last_response.md')
  };
}

function buildPrompt({ question, context, systemPrompt }) {
  const header = systemPrompt
    || 'You are a coding assistant. Use the context to propose minimal, safe changes.';
  const request = question && question.trim().length
    ? question.trim()
    : 'Analyze the latest changes and suggest next steps.';

  return [
    header,
    '',
    '=== CONTEXT ===',
    context || 'No context available.',
    '',
    '=== REQUEST ===',
    request,
    '',
    '=== RESPONSE FORMAT ===',
    '1) Diagnosis',
    '2) Proposed changes (minimal)',
    '3) Risks / tests'
  ].join('\n');
}

async function runOllamaApi({ model, prompt, systemPrompt, temperature }) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch not available');
  }
  const payload = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: typeof temperature === 'number' ? temperature : undefined
    }
  };
  if (systemPrompt) payload.system = systemPrompt;

  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  return { output: data.response || '', raw: data };
}

async function runOllamaCli({ model, prompt }) {
  return new Promise((resolve, reject) => {
    const child = spawn('ollama', ['run', model], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Ollama CLI exited with ${code}`));
        return;
      }
      resolve({ output: stdout, raw: { stderr } });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runOllama({ model, prompt, systemPrompt, temperature, logger }) {
  try {
    return await runOllamaApi({ model, prompt, systemPrompt, temperature });
  } catch (err) {
    if (logger) logger.warn(`Ollama API failed, falling back to CLI: ${err.message}`);
    return await runOllamaCli({ model, prompt });
  }
}

async function checkOllama() {
  return new Promise((resolve) => {
    const child = spawn('ollama', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', () => resolve({ ok: false, version: null }));
    child.on('close', (code) => {
      resolve({ ok: code === 0, version: output.trim() || null });
    });
  });
}

async function buildPromptFromContext({ sandboxRoot, config, agent, question, contextFormat }) {
  const format = contextFormat || config.ollama.context || 'compact';
  const context = await exportContext({ sandboxRoot, config, agent, format });
  const prompt = buildPrompt({
    question,
    context: truncateChars(context, config.ollama.maxPromptChars || 20000),
    systemPrompt: config.ollama.systemPrompt
  });
  return { prompt, context };
}

async function maybeRunOllamaAuto({ sandboxRoot, config, agent, aiContext, run, logger }) {
  if (!config.ollama || !config.ollama.enabled || !config.ollama.auto) return null;
  if (config.ollama.autoOnSuccessOnly && run && run.ok === false) return null;

  if (!aiContext) return null;

  const { prompt } = await buildPromptFromContext({
    sandboxRoot,
    config,
    agent,
    question: 'Summarize the latest run and suggest next actions.',
    contextFormat: config.ollama.context
  });

  const result = await runOllama({
    model: config.ollama.model,
    prompt,
    systemPrompt: config.ollama.systemPrompt,
    temperature: config.ollama.temperature,
    logger
  });

  const paths = ollamaPaths(sandboxRoot);
  await ensureDir(paths.root);
  await fs.writeFile(paths.lastPromptPath, prompt);
  await fs.writeFile(paths.lastResponsePath, result.output || '');

  if (logger) logger.info('Ollama auto-response saved.');
  return result;
}

module.exports = {
  buildPrompt,
  buildPromptFromContext,
  runOllama,
  maybeRunOllamaAuto,
  ollamaPaths,
  checkOllama
};
