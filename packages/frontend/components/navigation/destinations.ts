import type { AppDestination } from '@oxy.so/bloom/tab-pager';
import { RiAccountCircleLine } from '@oxy.so/bloom/icons/RiAccountCircleLine';
import { RiCalendarEventLine } from '@oxy.so/bloom/icons/RiCalendarEventLine';
import { RiHomeLine } from '@oxy.so/bloom/icons/RiHomeLine';
import { RiSearchLine } from '@oxy.so/bloom/icons/RiSearchLine';
import { RiTicketLine } from '@oxy.so/bloom/icons/RiTicketLine';

type Translate = (key: string) => string;

/**
 * Every place Vibbr's navigation leads, declared once. From this one list Bloom draws
 * the pager (swiped on native), the bottom bar and the shell's sidebar rows, so the app
 * writes no bar, no sidebar items and no navigation handlers.
 */
export function vibbrDestinations(t: Translate): AppDestination[] {
  return [
    {
      name: 'index',
      href: '/',
      bar: true,
      preload: true,
      label: t('tabs.discover'),
      icon: RiHomeLine,
    },
    {
      name: 'search',
      href: '/search',
      bar: true,
      preload: true,
      label: t('tabs.search'),
      icon: RiSearchLine,
    },
    {
      name: 'tickets',
      href: '/tickets',
      bar: true,
      preload: true,
      label: t('tabs.tickets'),
      icon: RiTicketLine,
    },
    {
      name: 'organize',
      href: '/organize',
      bar: true,
      preload: true,
      label: t('tabs.organize'),
      icon: RiCalendarEventLine,
    },
    {
      name: 'you',
      href: '/you',
      bar: true,
      preload: true,
      label: t('tabs.you'),
      icon: RiAccountCircleLine,
    },
  ];
}
