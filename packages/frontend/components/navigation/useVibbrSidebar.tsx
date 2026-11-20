import { RiTicketLine } from '@oxy.so/bloom/icons/RiTicketLine';
import type { SidebarProps } from '@oxy.so/bloom/sidebar';
import { useTabPager } from '@oxy.so/bloom/tab-pager';
import { useTheme } from '@oxy.so/bloom/theme';
import { ProfileButton } from '@oxy.so/services/ui/client';
import { useAppShell } from '@oxy.so/bloom/app-shell';

/** The account control at the foot of the sidebar; it closes the drawer before going anywhere. */
function VibbrSidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { selectDestination } = useTabPager();
  const { closeDrawer } = useAppShell();
  return (
    <ProfileButton
      expanded={!collapsed}
      onNavigateProfile={() => {
        closeDrawer();
        selectDestination('you');
      }}
      onBeforeAddAccount={closeDrawer}
    />
  );
}

/**
 * The chrome around the sidebar's rows. The rows themselves, their selection and the
 * primary action are Vibbr's destinations, which Bloom's app shell draws.
 */
export function useVibbrSidebar(): SidebarProps {
  const { selectDestination } = useTabPager();
  const { colors } = useTheme();
  return {
    surface: 'plain',
    size: 'md',
    contentAlignment: 'center',
    showSearch: false,
    showThemeToggle: false,
    logo: {
      icon: <RiTicketLine size="xl" color={colors.text} />,
      accessibilityLabel: 'Vibbr',
      onPress: () => selectDestination('index'),
    },
    footer: ({ collapsed }) => <VibbrSidebarFooter collapsed={collapsed} />,
  };
}
