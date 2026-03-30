// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package exports resolution so Metro can resolve ESM-only packages like roslib
config.resolver.unstable_enablePackageExports = true;

// roslib is ESM-only with no "main" field and exports only an "import" condition.
// Metro on native platforms falls back to file-based resolution which fails.
// Additionally, roslib dynamically imports "ws" (Node WebSocket) which pulls in
// Node built-ins (stream, http, etc.) that don't exist in React Native.
// At runtime, roslib detects native WebSocket and never uses the ws path,
// but Metro still tries to resolve it. We shim these to an empty module.
const emptyModule = path.resolve(__dirname, 'lib/empty-module.js');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Resolve roslib to its dist entry point directly
  if (moduleName === 'roslib') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/roslib/dist/RosLib.js'),
      type: 'sourceFile',
    };
  }

  // Shim Node-only modules that roslib/ws pull in but never use in RN.
  // Also shim fast-png which uses TextDecoder('latin1') unsupported in Hermes.
  // PNG decoding is only needed for rosbridge PNG compression mode which we don't use.
  const nodeShims = ['ws', 'stream', 'http', 'https', 'net', 'tls', 'zlib', 'url', 'bufferutil', 'utf-8-validate', 'fast-png'];
  if (nodeShims.includes(moduleName)) {
    return {
      filePath: emptyModule,
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
