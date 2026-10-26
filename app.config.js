// Dynamic Expo config = app.json + build info (git short commit, "-dirty" flag, build time) in extra.buildInfo.
// - Release (`npx expo run:ios --configuration Release`): expo-constants embeds this config at Xcode build time,
//   so the app shows the commit / time it was built from.
// - Metro (dev / reload): the dev server re-evaluates this file for every manifest request, so a reload shows
//   the current commit. No native module needed; read with Constants.expoConfig.extra.buildInfo.
const { execSync } = require('child_process');

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

module.exports = ({ config }) => {
  const commit = git('rev-parse --short HEAD');
  const dirty = commit ? git('status --porcelain').length > 0 : false;
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      buildInfo: { commit, dirty, builtAt: new Date().toISOString() },
    },
  };
};
