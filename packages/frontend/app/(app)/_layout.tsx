import { AppShell } from '@oxy.so/bloom/app-shell';
import { RiAddLine } from '@oxy.so/bloom/icons/RiAddLine';
import { stackSceneLayout } from '@oxy.so/bloom/panel-routing/expo-router';
import { TabPagerProvider } from '@oxy.so/bloom/tab-pager/expo-router';
import { ExperimentalStack, router, Slot, usePathname } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { vibbrDestinations } from '@/components/navigation/destinations';
import { useVibbrSidebar } from '@/components/navigation/useVibbrSidebar';
import { RightBar } from '@/components/RightBar';
import { hidesBottomBar } from '@/components/shell/bottomBarRoutes';

const IS_WEB = Platform.OS === 'web';

/**
 * Vibbr's shell, composed the way Mention's is: Bloom's `AppShell` draws the sidebar, the
 * bottom bar and the context column; the pages are the tab pager's destinations. The
 * provider sits above the shell because the bar renders over pushed routes too.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const destinations = useMemo(() => vibbrDestinations(t), [t]);
  return (
    <TabPagerProvider destinations={destinations}>
      <Shell />
    </TabPagerProvider>
  );
}

/** Reads the pager (the sidebar's logo and footer navigate through it), so it renders under the provider. */
function Shell() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const sidebar = useVibbrSidebar();

  // Web uses <Slot/> so the route flows in document scroll (the body is the scroller). Native
  // uses Expo Router's predictive-back-aware stack: the standard Stack cannot consume
  // Android's predictive callback and lets the Activity close.
  const centerContent = IS_WEB ? (
    <Slot />
  ) : (
    <ExperimentalStack screenOptions={{ headerShown: false }} screenLayout={stackSceneLayout}>
      {/* The five root tabs are ONE stack screen; everything else is pushed over them, which
          keeps the tabs alive underneath an event and makes Back return to the tab it came from. */}
      <ExperimentalStack.Screen name="(tabs)" />
    </ExperimentalStack>
  );

  return (
    <AppShell
      testID="vibbr-shell"
      layout="feed"
      presentation="framed"
      drawer="reveal"
      sidebar={sidebar}
      primaryAction={{
        icon: RiAddLine,
        accessibilityLabel: t('tabs.createEvent'),
        onPress: () => router.push('/manage/new'),
      }}
      header={null}
      gutter={8}
      bottomBar={hidesBottomBar(pathname) ? null : undefined}
      bottomBarVisibility="compact"
      reserveBottomBarSpace={IS_WEB && !hidesBottomBar(pathname)}
      panelLayout={{
        gap: 0,
        activePanel: 'main',
        panels: [
          {
            id: 'main',
            role: 'main',
            visible: true,
            keepMounted: true,
            errorBoundary: { resetKey: pathname },
            width: 620,
            resizable: false,
            content: centerContent,
          },
          {
            id: 'context',
            role: 'context',
            visible: true,
            sticky: true,
            width: 350,
            hideBelow: 990,
            appearance: 'plain',
            chrome: 'none',
            scroll: 'content',
            content: <RightBar />,
          },
        ],
      }}
    />
  );
}
