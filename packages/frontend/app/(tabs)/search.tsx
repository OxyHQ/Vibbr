import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [city, setCity] = useState('');
  const q = useDebounced(text.trim(), 300);
  const place = useDebounced(city.trim(), 300);
  const filters = useMemo(() => ({ ...(q && { q }), ...(place && { city: place }) }), [q, place]);
  const active = Boolean(q || place);
  const query = useEvents(filters, active);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="gap-2 p-4">
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
        <Problem title={t('search.title')} description={t('search.hint')} />
      ) : query.isPending ? (
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
          renderItem={({ item }) => <EventCardView card={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
        />
      )}
    </View>
  );
}
