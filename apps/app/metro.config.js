const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const worktreeRoot = path.resolve(__dirname, '../..');
const mainRepoRoot = path.resolve(worktreeRoot, '../../..');
const workspaceFallbackRoot = path.resolve(worktreeRoot, '../../../../../');

config.watchFolders = Array.from(
  new Set([
    ...(config.watchFolders ?? []),
    path.join(mainRepoRoot, 'node_modules'),
    path.join(mainRepoRoot, 'node_modules/.pnpm'),
    path.join(workspaceFallbackRoot, 'node_modules'),
    path.join(workspaceFallbackRoot, 'node_modules/.pnpm'),
  ]),
);

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: Array.from(
    new Set([
      ...(config.resolver?.nodeModulesPaths ?? []),
      path.join(mainRepoRoot, 'node_modules'),
      path.join(workspaceFallbackRoot, 'node_modules'),
    ]),
  ),
  unstable_enableSymlinks: true,
};

module.exports = withNativeWind(config, { input: './global.css' });
