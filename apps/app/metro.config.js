const path = require('path');
const fs = require('fs');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const worktreeRoot = path.resolve(__dirname, '../..');
const candidateRoots = [
  worktreeRoot,
  path.resolve(worktreeRoot, '../../..'),
  path.resolve(worktreeRoot, '../../../../../'),
];
const nodeModulesRoots = candidateRoots
  .map((root) => path.join(root, 'node_modules'))
  .filter((root) => fs.existsSync(root));
const pnpmRoots = nodeModulesRoots
  .map((root) => path.join(root, '.pnpm'))
  .filter((root) => fs.existsSync(root));

config.watchFolders = Array.from(
  new Set([
    ...(config.watchFolders ?? []),
    ...nodeModulesRoots,
    ...pnpmRoots,
  ]),
);

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: Array.from(
    new Set([
      ...(config.resolver?.nodeModulesPaths ?? []),
      ...nodeModulesRoots,
    ]),
  ),
  unstable_enableSymlinks: true,
};

module.exports = withNativeWind(config, { input: './global.css' });
