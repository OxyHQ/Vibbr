import { RiAccountCircleLine } from '@oxy.so/bloom/icons/RiAccountCircleLine';
import { RiCalendarEventLine } from '@oxy.so/bloom/icons/RiCalendarEventLine';
import { RiHomeLine } from '@oxy.so/bloom/icons/RiHomeLine';
import { RiSearchLine } from '@oxy.so/bloom/icons/RiSearchLine';
import { RiTicketLine } from '@oxy.so/bloom/icons/RiTicketLine';
import { TabBarMinimizeProvider } from '@oxy.so/bloom/tab-bar';
import {
  RouterTabBar,
  RouterTabBarButton,
  renderFadingTabScreen,
} from '@oxy.so/bloom/tab-bar/expo-router';
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';

const TABS = [
  { name: 'index', href: '/', key: 'discover', icon: <RiHomeLine /> },
  { name: 'search', href: '/search', key: 'search', icon: <RiSearchLine /> },
  { name: 'tickets', href: '/tickets', key: 'tickets', icon: <RiTicketLine /> },
  { name: 'organize', href: '/organize', key: 'organize', icon: <RiCalendarEventLine /> },
  { name: 'you', href: '/you', key: 'you', icon: <RiAccountCircleLine /> },
] as const;

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <TabBarMinimizeProvider>
      <Tabs>
        <TabSlot style={{ height: '100%' }} renderFn={renderFadingTabScreen} />
        <TabList asChild>
          <RouterTabBar onIndexChange={(i) => router.navigate(TABS[i]?.href ?? '/')}>
            {TABS.map(({ href, key, ...item }, index) => (
              <TabTrigger key={item.name} name={item.name} href={href} asChild>
                <RouterTabBarButton item={{ ...item, label: t(`tabs.${key}`) }} index={index} />
              </TabTrigger>
            ))}
          </RouterTabBar>
        </TabList>
      </Tabs>
    </TabBarMinimizeProvider>
  );
}
