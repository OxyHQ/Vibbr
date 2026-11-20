import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { EventCardView } from '@/components/EventCardView';
import { useEvents } from '@/hooks/queries';

/** The shell's context column: what is coming up, beside the page in front. */
export function RightBar() {
  const { t } = useTranslation();
  const query = useEvents({});
  const items = query.data?.pages.flatMap((page) => page.items).slice(0, 3) ?? [];
  if (items.length === 0) return null;
  return (
    <View className="gap-3 p-4">
      <Text className="text-lg font-semibold">{t('rightBar.upcoming')}</Text>
      {items.map((card) => (
        <EventCardView key={card.id} card={card} />
      ))}
    </View>
  );
}
