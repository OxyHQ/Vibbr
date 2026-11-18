const pkg = require('./package.json');

module.exports = () => {
  const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development';
  const APP_ID = IS_DEV_VARIANT ? 'co.vibbr.app.dev' : 'co.vibbr.app';
  const APP_NAME = IS_DEV_VARIANT ? 'Vibbr (Dev)' : 'Vibbr';

  return {
    expo: {
      name: APP_NAME,
      slug: 'vibbr',
      version: pkg.version,
      orientation: 'portrait',
      icon: './assets/images/icon.png',
      scheme: 'vibbr',
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,
      experiments: { typedRoutes: true, reactCompiler: true },
      ios: {
        supportsTablet: true,
        bundleIdentifier: APP_ID,
        // Universal Links: the backend (or the web host) serves the association file.
        associatedDomains: ['applinks:vibbr.co'],
        infoPlist: {
          // "Continue with Oxy" can open Commons on iOS.
          LSApplicationQueriesSchemes: ['oxycommons'],
          NSCameraUsageDescription: 'Vibbr uses the camera to scan tickets at the door.',
        },
      },
      android: {
        package: APP_ID,
        permissions: ['android.permission.CAMERA'],
        predictiveBackGestureEnabled: true,
        adaptiveIcon: {
          foregroundImage: './assets/images/icon_foreground.png',
          backgroundImage: './assets/images/icon_background.png',
          monochromeImage: './assets/images/icon_monochrome.png',
        },
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: 'vibbr.co', pathPrefix: '/e/' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
      web: { bundler: 'metro', output: 'single', favicon: './assets/images/favicon.png' },
      plugins: [
        'expo-router',
        'expo-secure-store',
        ['expo-camera', { cameraPermission: 'Vibbr uses the camera to scan tickets at the door.' }],
        ['expo-location', { locationWhenInUsePermission: 'Vibbr shows events near you.' }],
        '@oxy.so/bloom',
      ],
      extra: {
        router: {},
      },
    },
  };
};
