import { EventId, type PaymentMode, type TicketTypeInput } from '@vibbr.co/contracts';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import {
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlItemText,
} from '@oxy.so/bloom/segmented-control';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { Loading, Problem } from '@/components/Centered';
import { FieldError, Section } from '@/components/FormRow';
import { keys, useManagedEvent, useManagedTicketTypes } from '@/hooks/queries';
import { api } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';
import { decimalToMinor, formatEventWhen, formatMoney } from '@/lib/format';

const MODES: PaymentMode[] = ['free', 'door', 'online', 'choice'];

function AddTicketType({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [mode, setMode] = useState<PaymentMode>('door');
  const [quota, setQuota] = useState('');
  const [limit, setLimit] = useState('10');

  const free = mode === 'free';
  const minor = free ? '0' : decimalToMinor(price, currency.toUpperCase());
  const valid =
    name.trim() &&
    minor !== null &&
    (free || BigInt(minor) > 0n) &&
    /^[1-9]\d{0,6}$/.test(quota) &&
    /^[1-9]\d{0,2}$/.test(limit) &&
    /^[A-Za-z]{3}$/.test(currency);

  const add = useMutation({
    mutationFn: () => {
      const input: TicketTypeInput = {
        name: name.trim(),
        priceAmount: minor as string,
        currency: currency.toUpperCase(),
        paymentMode: mode,
        quota: Number(quota),
        perPersonLimit: Number(limit),
        named: false,
        transferable: true,
        resellable: false,
        hidden: false,
      };
      return api.manage.createTicketType(eventId, input);
    },
    onSuccess: () => {
      setName('');
      setPrice('');
      setQuota('');
      void client.invalidateQueries({ queryKey: keys.managedTypes(eventId) });
      void client.invalidateQueries({ queryKey: keys.ticketTypes(eventId) });
    },
  });

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">{t('manage.addTicketType')}</Text>
      <TextField>
        <TextFieldInput
          label={t('manage.ticketName')}
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
      </TextField>
      <SegmentedControl
        label={t('manage.paymentMode')}
        type="radio"
        value={mode}
        onValueChange={(v) => setMode(v as PaymentMode)}
      >
        {MODES.map((m) => (
          <SegmentedControlItem key={m} value={m}>
            <SegmentedControlItemText>{t(`payment.${m}`)}</SegmentedControlItemText>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {!free ? (
        <View className="flex-row gap-3">
          <View style={{ flex: 1 }}>
            <TextField>
              <TextFieldInput
                label={t('manage.price')}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </TextField>
          </View>
          <View style={{ width: 100 }}>
            <TextField>
              <TextFieldInput
                label={t('manage.currency')}
                value={currency}
                onChangeText={setCurrency}
                autoCapitalize="characters"
                maxLength={3}
              />
            </TextField>
          </View>
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <View style={{ flex: 1 }}>
          <TextField>
            <TextFieldInput
              label={t('manage.quota')}
              value={quota}
              onChangeText={setQuota}
              keyboardType="number-pad"
            />
          </TextField>
        </View>
        <View style={{ width: 120 }}>
          <TextField>
            <TextFieldInput
              label={t('buy.quantity')}
              value={limit}
              onChangeText={setLimit}
              keyboardType="number-pad"
            />
          </TextField>
        </View>
      </View>
      {mode === 'online' || mode === 'choice' ? (
        <Text className="text-xs text-muted-foreground">{t('payment.onlineSoon')}</Text>
      ) : null}
      <Button
        appearance="solid"
        tone="accent"
        disabled={!valid || add.isPending}
        onPress={() => add.mutate()}
      >
        {t('manage.save')}
      </Button>
      <FieldError message={add.isError ? errorMessage(add.error, t) : null} />
    </View>
  );
}

export default function ManageEvent() {
  const raw = useLocalSearchParams<{ id: string }>().id;
  const id = EventId.safeParse(raw).success ? (raw as string) : '';
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const event = useManagedEvent(id);
  const types = useManagedTicketTypes(id);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.managedEvent(id) });
    void client.invalidateQueries({ queryKey: keys.event(id) });
  };
  const publish = useMutation({
    mutationFn: (revision: number) => api.manage.publish(id, revision),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: () => api.manage.cancel(id), onSuccess: refresh });

  if (!id) return <Problem title={t('event.notFound')} />;
  if (event.isPending) return <Loading />;
  if (event.isError || !event.data) return <Problem title={t('errors.forbidden')} />;
  const e = event.data;
  const conflict = publish.isError && errorCode(publish.error) === 'revision_conflict';

  return (
    <Screen header={<PageHeader title={e.title} />}>
      <ScreenScrollView contentContainerClassName="pb-10">
        <View className="mx-auto w-full max-w-[640px] gap-6 p-4">
          <View className="gap-2">
            <Text className="text-2xl font-bold text-foreground">{e.title}</Text>
            <Text className="text-sm text-muted-foreground">
              {formatEventWhen(e.startsAt, e.timeZone, i18n.language)}
            </Text>
            <View className="flex-row">
              <Chip
                variant="subtle"
                color={
                  e.status === 'published'
                    ? 'success'
                    : e.status === 'cancelled'
                      ? 'error'
                      : 'default'
                }
              >
                {t(`manage.${e.status}`)}
              </Chip>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {e.status === 'draft' ? (
              <Button
                appearance="solid"
                tone="accent"
                disabled={publish.isPending || (types.data ?? []).length === 0}
                onPress={() => publish.mutate(e.revision)}
              >
                {t('manage.publish')}
              </Button>
            ) : null}
            {e.status === 'published' ? (
              <>
                <Link href={{ pathname: '/manage/scan', params: { eventId: e.id } }} asChild>
                  <Button appearance="solid" tone="accent">
                    {t('manage.scan')}
                  </Button>
                </Link>
                <Link href={`/e/${e.id}`} asChild>
                  <Button appearance="subtle" tone="neutral">
                    {t('event.share')}
                  </Button>
                </Link>
                <Button
                  appearance="subtle"
                  tone="danger"
                  disabled={cancel.isPending}
                  onPress={() => cancel.mutate()}
                >
                  {t('manage.cancelEvent')}
                </Button>
              </>
            ) : null}
          </View>
          <FieldError
            message={
              conflict
                ? t('manage.conflict')
                : publish.isError
                  ? errorMessage(publish.error, t)
                  : cancel.isError
                    ? errorMessage(cancel.error, t)
                    : null
            }
          />

          <Section title={t('manage.ticketTypes')}>
            {(types.data ?? []).map((type) => (
              <View
                key={type.id}
                className="flex-row items-center justify-between rounded-xl border border-border p-3"
              >
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">{type.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {t(`payment.${type.paymentMode}`)} · {type.quota - type.remaining}/{type.quota}
                  </Text>
                </View>
                <Text className="text-base font-bold text-foreground">
                  {BigInt(type.priceAmount) === 0n
                    ? t('event.free')
                    : formatMoney(type.priceAmount, type.currency, i18n.language)}
                </Text>
              </View>
            ))}
            {e.status !== 'cancelled' && e.status !== 'ended' ? (
              <AddTicketType eventId={e.id} />
            ) : null}
          </Section>
        </View>
      </ScreenScrollView>
    </Screen>
  );
}
