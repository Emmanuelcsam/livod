const fs = require('fs/promises');
const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { buildPromptFromContext, runOllama, checkOllama, ollamaPaths } = require('../../integrations/ollama');
const { ensureDir } = require('../../shared/fs');

async function ollamaCommand({ repoRoot, options, logger, agent, positionals, subcommand }) {
  const mode = subcommand || 'ask';

  if (mode === 'check') {
    const status = await checkOllama();
    if (status.ok) {
      logger.info(`Ollama available: ${status.version || 'ok'}`);
    } else {
      logger.warn('Ollama not available on PATH.');
    }
    return;
  }

  const { config } = await loadConfig(repoRoot, options);
  if (!config.ollama) config.ollama = { enabled: true };
  config.ollama.enabled = true;
  if (config.ai && config.ai.enabled === false) {
    logger.warn('AI journaling is disabled; context may be empty.');
  }

  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  const question = positionals.join(' ').trim();
  const contextFormat = options.ollamaContext || options.format || config.ollama.context || 'compact';

  const { prompt } = await buildPromptFromContext({
    sandboxRoot,
    config,
    agent,
    question,
    contextFormat
  });

  if (mode === 'prompt') {
    process.stdout.write(prompt);
    return;
  }

  const result = await runOllama({
    model: options.ollamaModel || config.ollama.model,
    prompt,
    systemPrompt: options.ollamaSystemPrompt || config.ollama.systemPrompt,
    temperature: options.ollamaTemperature ?? config.ollama.temperature,
    logger
  });

  const paths = ollamaPaths(sandboxRoot);
  await ensureDir(paths.root);
  await fs.writeFile(paths.lastPromptPath, prompt);
  await fs.writeFile(paths.lastResponsePath, result.output || '');

  process.stdout.write(result.output || '');
}

module.exports = {
  ollamaCommand
};
