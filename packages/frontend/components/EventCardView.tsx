import type { EventCard } from '@vibbr.co/contracts';
import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Chip } from '@oxy.so/bloom/chip';
import { formatEventWhen, priceLabel } from '@/lib/format';

/**
 * One event in a list. App-local for now: a Vibbr event card belongs in Bloom
 * (it composes Bloom's media card, chip and price tokens only) and moves there
 * with its own docs once the shape settles.
 */
export function EventCardView({ card }: { card: EventCard }) {
  const { t, i18n } = useTranslation();
  const price = priceLabel(card, i18n.language);
  const where = [card.venueName, card.city].filter(Boolean).join(' · ');
  return (
    <Link href={`/e/${card.id}`} asChild>
      <Pressable
        accessibilityRole="link"
        className="mb-3 overflow-hidden rounded-2xl border border-border bg-card"
      >
        {card.coverUrl ? (
          <Image
            source={{ uri: card.coverUrl }}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            contentFit="cover"
          />
        ) : null}
        <View className="gap-1 p-4">
          <Text className="text-xs font-semibold uppercase text-primary">
            {formatEventWhen(card.startsAt, card.timeZone, i18n.language)}
          </Text>
          <Text className="text-lg font-bold text-foreground" numberOfLines={2}>
            {card.title}
          </Text>
          {where ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {where}
            </Text>
          ) : null}
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            {card.status === 'cancelled' ? (
              <Chip variant="solid" color="error">
                {t('event.cancelled')}
              </Chip>
            ) : card.soldOut ? (
              <Chip variant="subtle" color="warning">
                {t('event.soldOut')}
              </Chip>
            ) : card.free ? (
              <Chip variant="subtle" color="success">
                {t('event.free')}
              </Chip>
            ) : price ? (
              <Chip variant="subtle">{t('event.from', { price })}</Chip>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
