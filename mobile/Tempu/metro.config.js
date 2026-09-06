// Metro config exists purely to make a WEB bundle possible. Native builds get
// the stock Expo config — the resolver override below only ever fires for
// `platform === 'web'`, so Android and iOS resolve every package as before.
//
// `npx expo start --web` is a convenience for checking layout, navigation and
// flows in a browser. It is NOT a shipping web target: the modules listed here
// are native-only and are swapped for placeholders on web (see web-shims/).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const WEB_SHIMS = {
  'react-native-maps': path.resolve(__dirname, 'web-shims/react-native-maps.js'),
};

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return (upstreamResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
