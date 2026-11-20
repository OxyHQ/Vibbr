import { EventId } from '@vibbr.co/contracts';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Share, Text, View } from 'react-native';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import { Loading, Problem } from '@/components/Centered';
import { TicketPicker } from '@/components/TicketPicker';
import {
  useAttendance,
  useEvent,
  useEventResale,
  useEventTicketTypes,
  useResaleActions,
  useSetAttendance,
} from '@/hooks/queries';
import { useViewer } from '@/hooks/useViewer';
import { errorMessage } from '@/lib/errors';
import { formatEventWhen, formatMoney } from '@/lib/format';

export default function EventScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id;
  const id = EventId.safeParse(raw).success ? (raw as string) : '';
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { signedIn } = useViewer();
  const event = useEvent(id);
  const types = useEventTicketTypes(id);
  const resale = useEventResale(id);
  const attendance = useAttendance(id, signedIn && !!id);
  const setAttendance = useSetAttendance(id);
  const resaleActions = useResaleActions(id);

  if (!id) return <Problem sticker="notFound" title={t('event.notFound')} />;
  if (event.isPending) return <Loading />;
  if (event.isError || !event.data)
    return (
      <Problem
        sticker="notFound"
        title={t('event.notFound')}
        description={t('event.notFoundHint')}
        action={{ label: t('common.back'), onPress: () => router.back() }}
      />
    );

  const e = event.data;
  const onSale = e.status === 'published';
  const state = attendance.data ?? null;
  const share = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
      void navigator.share({ title: e.title, url: e.url }).catch(() => undefined);
    } else {
      void Share.share({ message: `${e.title} ${e.url}` });
    }
  };

  return (
    <Screen header={<PageHeader title={e.title} />}>
      <ScreenScrollView contentContainerClassName="pb-10">
        {e.coverUrl ? (
          <Image
            source={{ uri: e.coverUrl }}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            contentFit="cover"
          />
        ) : null}
        <View className="mx-auto w-full max-w-[720px] gap-5 p-4">
          <View className="gap-1">
            <Text className="text-xs font-semibold uppercase text-primary">
              {formatEventWhen(e.startsAt, e.timeZone, i18n.language)}
            </Text>
            <Text className="text-2xl font-bold text-foreground">{e.title}</Text>
            {e.summary ? (
              <Text className="text-base text-muted-foreground">{e.summary}</Text>
            ) : null}
          </View>

          <View className="flex-row flex-wrap gap-2">
            {e.status === 'cancelled' ? (
              <Chip variant="solid" color="error">
                {t('event.cancelled')}
              </Chip>
            ) : null}
            {e.status === 'ended' ? <Chip variant="subtle">{t('event.ended')}</Chip> : null}
            {e.place.mode !== 'in_person' ? (
              <Chip variant="subtle">
                {e.place.mode === 'online' ? t('event.online') : t('event.hybrid')}
              </Chip>
            ) : null}
            {e.ageMinimum ? (
              <Chip variant="subtle">{t('event.ageMinimum', { age: e.ageMinimum })}</Chip>
            ) : null}
            <Chip variant="subtle">{t(`category.${e.category}`)}</Chip>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {signedIn ? (
              <>
                <Button
                  tone="accent"
                  appearance={state === 'going' ? 'solid' : 'subtle'}
                  size="sm"
                  onPress={() => setAttendance.mutate(state === 'going' ? null : 'going')}
                >
                  {t('event.going')}
                </Button>
                <Button
                  tone="accent"
                  appearance={state === 'interested' ? 'solid' : 'subtle'}
                  size="sm"
                  onPress={() => setAttendance.mutate(state === 'interested' ? null : 'interested')}
                >
                  {t('event.interested')}
                </Button>
              </>
            ) : null}
            <Button tone="neutral" appearance="subtle" size="sm" onPress={share}>
              {t('event.share')}
            </Button>
          </View>

          {e.description ? (
            <View className="gap-1">
              <Text className="text-base font-semibold text-foreground">{t('event.about')}</Text>
              <Text className="text-base leading-6 text-foreground">{e.description}</Text>
            </View>
          ) : null}

          {e.lineup.length > 0 ? (
            <View className="gap-1">
              <Text className="text-base font-semibold text-foreground">{t('event.lineup')}</Text>
              {e.lineup.map((entry) => (
                <Text
                  key={`${entry.name}|${entry.startsAt ?? ''}|${entry.role ?? ''}`}
                  className="text-base text-foreground"
                >
                  {entry.name}
                  {entry.role ? ` · ${entry.role}` : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {onSale ? (
            <View className="gap-3">
              <Text className="text-base font-semibold text-foreground">{t('event.tickets')}</Text>
              {types.isPending ? (
                <Loading />
              ) : (types.data ?? []).length === 0 ? (
                <Text className="text-sm text-muted-foreground">{t('event.noTickets')}</Text>
              ) : (
                (types.data ?? []).map((type) => (
                  <TicketPicker key={type.id} eventId={e.id} type={type} />
                ))
              )}
            </View>
          ) : null}

          {onSale ? (
            <View className="gap-2">
              <Text className="text-base font-semibold text-foreground">{t('event.resale')}</Text>
              {(resale.data ?? []).length === 0 ? (
                <Text className="text-sm text-muted-foreground">{t('event.resaleEmpty')}</Text>
              ) : (
                (resale.data ?? []).map((listing) => (
                  <View
                    key={listing.id}
                    className="flex-row items-center justify-between rounded-xl border border-border p-3"
                  >
                    <Text className="text-base font-semibold text-foreground">
                      {formatMoney(listing.priceAmount, listing.currency, i18n.language)}
                    </Text>
                    {signedIn ? (
                      <Button
                        tone="accent"
                        appearance="subtle"
                        size="sm"
                        disabled={resaleActions.buy.isPending}
                        onPress={() => resaleActions.buy.mutate({ listingId: listing.id })}
                      >
                        {t('tickets.buyListing')}
                      </Button>
                    ) : null}
                  </View>
                ))
              )}
              {resaleActions.buy.isError ? (
                <Text className="text-sm text-destructive">
                  {errorMessage(resaleActions.buy.error, t)}
                </Text>
              ) : null}
              {resaleActions.buy.isSuccess ? (
                <Text className="text-sm text-foreground">{t('tickets.bought')}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScreenScrollView>
    </Screen>
  );
}
