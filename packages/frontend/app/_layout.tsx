import 'react-native-reanimated';
import '../global.css';
import { BloomProvider } from '@oxy.so/bloom/provider';
import { OverlayInertBoundary, PortalOutlet, PortalProvider } from '@oxy.so/bloom/portal';
import { SurfaceHost } from '@oxy.so/bloom/surfaces';
import { OxyProvider } from '@oxy.so/services/ui/client';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DEFAULT_LANGUAGE,
  OXY_AUTH_REDIRECT_URI,
  OXY_CLIENT_ID,
  SUPPORTED_LANGUAGES,
} from '@/lib/config';
import { appI18n, initI18n, setLanguage } from '@/lib/i18n';
import { oxyServices } from '@/lib/oxyServices';
import { queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void initI18n().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BloomProvider defaultMode="system" locale={appI18n.language}>
          {/* webAuthMode="popup" keeps a signed-out cold boot on a deep route from leaving the origin. */}
          <OxyProvider
            oxyServices={oxyServices}
            clientId={OXY_CLIENT_ID}
            authRedirectUri={OXY_AUTH_REDIRECT_URI}
            webAuthMode="popup"
            storageKeyPrefix="vibbr"
            queryClient={queryClient}
            language={{
              supportedLocales: SUPPORTED_LANGUAGES,
              fallbackLocale: DEFAULT_LANGUAGE,
              onChange: async (language: string) => {
                await setLanguage(language);
              },
            }}
          >
            <I18nextProvider i18n={appI18n}>
              <PortalProvider>
                <OverlayInertBoundary>
                  <Stack screenOptions={{ headerShown: false }} />
                </OverlayInertBoundary>
                <PortalOutlet />
                <SurfaceHost />
              </PortalProvider>
            </I18nextProvider>
          </OxyProvider>
        </BloomProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
