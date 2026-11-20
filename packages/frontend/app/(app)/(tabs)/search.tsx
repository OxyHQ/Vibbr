import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { Loading, Problem } from '@/components/Centered';
import { EventCardView } from '@/components/EventCardView';
import { useEvents } from '@/hooks/queries';

/** Waits for the typing to pause before it asks the server anything. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export default function Search() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [city, setCity] = useState('');
  const q = useDebounced(text.trim(), 300);
  const place = useDebounced(city.trim(), 300);
  const filters = useMemo(() => ({ ...(q && { q }), ...(place && { city: place }) }), [q, place]);
  const active = Boolean(q || place);
  const query = useEvents(filters, active);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen header={<PageHeader title={t('tabs.search')} />}>
      <ScreenScrollView
        contentContainerClassName="gap-4 p-4"
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
      >
        <View className="gap-2">
          <TextField>
            <TextFieldInput
              label={t('search.placeholder')}
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </TextField>
          <TextField>
            <TextFieldInput label={t('search.city')} value={city} onChangeText={setCity} />
          </TextField>
        </View>
        {!active ? (
          <Problem sticker="searchIdle" title={t('search.title')} description={t('search.hint')} />
        ) : query.isPending ? (
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
            sticker="searchNoResults"
            title={t('search.noResults')}
            description={t('search.noResultsHint')}
          />
        ) : (
          items.map((card) => <EventCardView key={card.id} card={card} />)
        )}
      </ScreenScrollView>
    </Screen>
  );
}
