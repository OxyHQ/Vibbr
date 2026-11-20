import { EVENT_CATEGORIES } from '@vibbr.co/contracts';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Loading, Problem } from '@/components/Centered';
import { EventCardView } from '@/components/EventCardView';
import { useEvents } from '@/hooks/queries';

export default function Discover() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<(typeof EVENT_CATEGORIES)[number] | undefined>();
  const [freeOnly, setFreeOnly] = useState(false);
  const filters = useMemo(
    () => ({ ...(category && { category }), ...(freeOnly && { free: 'true' as const }) }),
    [category, freeOnly],
  );
  const query = useEvents(filters);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  return (
    <Screen header={<PageHeader title={t('tabs.discover')} />}>
      <ScreenScrollView
        contentContainerClassName="gap-4 p-4"
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 max-h-12">
          <View className="flex-row gap-2 px-4">
            <Chip
              variant={!category && !freeOnly ? 'solid' : 'subtle'}
              onPress={() => {
                setCategory(undefined);
                setFreeOnly(false);
              }}
            >
              {t('discover.anyCategory')}
            </Chip>
            <Chip variant={freeOnly ? 'solid' : 'subtle'} onPress={() => setFreeOnly((v) => !v)}>
              {t('discover.free')}
            </Chip>
            {EVENT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                variant={category === c ? 'solid' : 'subtle'}
                onPress={() => setCategory(category === c ? undefined : c)}
              >
                {t(`category.${c}`)}
              </Chip>
            ))}
          </View>
        </ScrollView>

        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Problem
            sticker="loadError"
            title={t('discover.error')}
            description={t('common.loadErrorHint')}
            action={{ label: t('discover.retry'), onPress: () => void query.refetch() }}
          />
        ) : items.length === 0 ? (
          <Problem
            sticker="discoverEmpty"
            title={t('discover.empty')}
            description={t('discover.emptyHint')}
          />
        ) : (
          <>
            {items.map((card) => (
              <EventCardView key={card.id} card={card} />
            ))}
            {query.hasNextPage ? (
              <Button
                tone="neutral"
                appearance="subtle"
                onPress={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {t('discover.loadMore')}
              </Button>
            ) : null}
          </>
        )}
      </ScreenScrollView>
    </Screen>
  );
}
