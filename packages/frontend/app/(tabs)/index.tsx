import { EVENT_CATEGORIES, type EventCard } from '@vibbr.co/contracts';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import { Loading, Problem } from '@/components/Centered';
import { EventCardView } from '@/components/EventCardView';
import { useEvents } from '@/hooks/queries';

export default function Discover() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<(typeof EVENT_CATEGORIES)[number] | undefined>();
  const [freeOnly, setFreeOnly] = useState(false);
  const filters = useMemo(
    () => ({ ...(category && { category }), ...(freeOnly && { free: 'true' as const }) }),
    [category, freeOnly],
  );
  const query = useEvents(filters);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const renderItem = useCallback(
    ({ item }: { item: EventCard }) => <EventCardView card={item} />,
    [],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-14 py-2"
        contentContainerClassName="gap-2 px-4"
      >
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
      </ScrollView>

      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Problem
          title={t('discover.error')}
          action={{ label: t('discover.retry'), onPress: () => void query.refetch() }}
        />
      ) : items.length === 0 ? (
        <Problem title={t('discover.empty')} description={t('discover.emptyHint')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(card) => card.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          ListFooterComponent={
            query.hasNextPage ? (
              <Button
                tone="neutral"
                appearance="subtle"
                onPress={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {t('discover.loadMore')}
              </Button>
            ) : undefined
          }
        />
      )}
    </View>
  );
}
