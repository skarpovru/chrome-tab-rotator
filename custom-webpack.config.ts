import type { Configuration } from 'webpack';

module.exports = {
  entry: { background: { import: 'src/background/background.ts', runtime: false } },
} as Configuration;
