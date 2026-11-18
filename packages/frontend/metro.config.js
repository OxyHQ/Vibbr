// The shared Oxy Metro config: monorepo watch folders, package-exports
// resolution, the web font/wasm asset extensions, NativeWind and the Bloom
// single-instance rewrite all come from the preset.
const { createOxyMetroConfig } = require('@oxy.so/app-preset/metro');

const config = createOxyMetroConfig(__dirname, {
  sharedTypesPackage: '@vibbr.co/contracts',
  cssInput: './global.css',
  dropConsole: true,
});

// Web assets are UTF-8: keep locale text instead of expanding every non-ASCII
// character into a six-byte escape.
config.transformer.minifierConfig.output.ascii_only = false;

module.exports = config;
