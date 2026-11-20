import { TicketId } from '@vibbr.co/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { Button } from '@oxy.so/bloom/button';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { Loading, Problem } from '@/components/Centered';
import { RotatingQr } from '@/components/RotatingQr';
import { useEventTicketTypes, useResaleActions, useTransferTicket } from '@/hooks/queries';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { decimalToMinor } from '@/lib/format';

export default function TicketScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id;
  const id = TicketId.safeParse(raw).success ? (raw as string) : '';
  const { t } = useTranslation();
  const ticket = useQuery({
    queryKey: ['ticket', id],
    enabled: !!id,
    queryFn: () => api.tickets.get(id),
  });
  const transfer = useTransferTicket();
  const [to, setTo] = useState('');
  const [holder, setHolder] = useState('');
  const [price, setPrice] = useState('');

  const eventId = ticket.data?.eventId ?? '';
  const resale = useResaleActions(eventId);
  const ticketTypes = useEventTicketTypes(eventId);
  const listings = useQuery({
    queryKey: ['resale', eventId],
    enabled: !!eventId,
    queryFn: () => api.events.resale(eventId).then((r) => r.items),
  });

  if (!id) return <Problem title={t('errors.not_found')} />;
  if (ticket.isPending) return <Loading />;
  if (ticket.isError || !ticket.data) return <Problem title={t('errors.not_found')} />;

  const data = ticket.data;
  const mine = (listings.data ?? []).find((l) => l.ticketId === data.id);
  const usable = data.status === 'valid' || data.status === 'listed';
  // The price is typed in the ticket type's own currency, whose exponent decides the decimals.
  const currency = (ticketTypes.data ?? []).find((type) => type.id === data.ticketTypeId)?.currency;
  const minor = currency ? decimalToMinor(price, currency) : null;

  return (
    <Screen header={<PageHeader title={t('tickets.show')} />}>
      <ScreenScrollView contentContainerClassName="pb-10">
        <View className="mx-auto w-full max-w-[520px] gap-6 p-4">
          {usable ? (
            <RotatingQr ticketId={data.id} />
          ) : (
            <Text className="text-center text-base text-muted-foreground">
              {t(`tickets.${data.status}`)}
            </Text>
          )}
          {data.holderName ? (
            <Text className="text-center text-base font-semibold text-foreground">
              {t('tickets.holder', { name: data.holderName })}
            </Text>
          ) : null}
          {data.paymentChoice === 'door' ? (
            <Text className="text-center text-sm text-muted-foreground">
              {t('tickets.paidAtDoor')}
            </Text>
          ) : null}

          {data.status === 'valid' ? (
            <View className="gap-3">
              <Text className="text-base font-semibold text-foreground">
                {t('tickets.transfer')}
              </Text>
              <TextField>
                <TextFieldInput
                  label={t('tickets.transferTo')}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                />
              </TextField>
              <TextField>
                <TextFieldInput
                  label={t('buy.holderName', { n: 1 })}
                  value={holder}
                  onChangeText={setHolder}
                />
              </TextField>
              <Button
                tone="neutral"
                appearance="solid"
                disabled={!to.trim() || transfer.isPending}
                onPress={() =>
                  transfer.mutate({
                    ticketId: data.id,
                    to: to.trim(),
                    ...(holder.trim() && { holderName: holder.trim() }),
                  })
                }
              >
                {t('tickets.transfer')}
              </Button>
              {transfer.isError ? (
                <Text className="text-sm text-destructive">{errorMessage(transfer.error, t)}</Text>
              ) : null}
              {transfer.isSuccess ? (
                <Text className="text-sm text-foreground">{t('tickets.transferred')}</Text>
              ) : null}

              <Text className="mt-2 text-base font-semibold text-foreground">
                {t('tickets.resell')}
              </Text>
              <TextField>
                <TextFieldInput
                  label={t('tickets.price')}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </TextField>
              <Button
                tone="accent"
                appearance="subtle"
                disabled={minor === null || resale.list.isPending}
                onPress={() => minor && resale.list.mutate({ ticketId: data.id, price: minor })}
              >
                {t('tickets.resell')}
              </Button>
              {resale.list.isError ? (
                <Text className="text-sm text-destructive">
                  {errorMessage(resale.list.error, t)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {data.status === 'listed' && mine ? (
            <Button
              tone="danger"
              appearance="subtle"
              disabled={resale.withdraw.isPending}
              onPress={() => resale.withdraw.mutate(mine.id)}
            >
              {t('tickets.withdraw')}
            </Button>
          ) : null}
        </View>
      </ScreenScrollView>
    </Screen>
  );
}
