import 'react-native-reanimated';
import '../global.css';
import { useBackWithFallback } from '@oxy.so/bloom/panel-routing/expo-router';
import { BloomProvider } from '@oxy.so/bloom/provider';
import { expoRouterScrollAdapter } from '@oxy.so/bloom/scroll/expo-router';
import { OverlayInertBoundary, PortalOutlet, PortalProvider } from '@oxy.so/bloom/portal';
import { SurfaceHost } from '@oxy.so/bloom/surfaces';
import { OxyProvider } from '@oxy.so/services/ui/client';
import { Slot } from 'expo-router';
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
import { BLOOM_THEME_PERSIST_KEY, BLOOM_THEME_STORAGE } from '@/lib/themePersistence';
import { oxyServices } from '@/lib/oxyServices';
import { queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const back = useBackWithFallback('/');
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
        <BloomProvider
          defaultMode="system"
          locale={appI18n.language}
          scrollAdapter={expoRouterScrollAdapter}
          back={back}
          persistKey={BLOOM_THEME_PERSIST_KEY}
          storage={BLOOM_THEME_STORAGE}
        >
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
                  <Slot />
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
