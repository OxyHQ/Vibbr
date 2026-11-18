import type { OrderInput, TicketType } from '@vibbr.co/contracts';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button } from '@oxy.so/bloom/button';
import {
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlItemText,
} from '@oxy.so/bloom/segmented-control';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { useViewer } from '@/hooks/useViewer';
import { usePlaceOrder, useWaitlistActions } from '@/hooks/queries';
import { errorMessage } from '@/lib/errors';
import { formatMoney, newIdempotencyKey } from '@/lib/format';

type Choice = 'door' | 'online';

const PAYMENT_LABEL = {
  free: 'payment.free',
  door: 'payment.door',
  online: 'payment.online',
  choice: 'payment.choice',
} as const;

/** Whether the buyer has to pick how to pay for this ticket type. */
export function needsChoice(type: TicketType): boolean {
  return type.paymentMode === 'choice';
}

/**
 * Picks quantity (and holder names, and how to pay) for one ticket type and
 * places the order. A purchase attempt keeps ONE idempotency key until it
 * succeeds or the selection changes, so a double tap or a retry after a dropped
 * connection can never buy twice.
 */
export function TicketPicker({ eventId, type }: { eventId: string; type: TicketType }) {
  const { t, i18n } = useTranslation();
  const { signedIn, signIn } = useViewer();
  const place = usePlaceOrder();
  const waitlist = useWaitlistActions();
  const [quantity, setQuantity] = useState(1);
  const [choice, setChoice] = useState<Choice>('door');
  const [names, setNames] = useState<string[]>([]);
  const key = useRef<{ fingerprint: string; value: string } | null>(null);

  const max = Math.max(1, Math.min(type.perPersonLimit, type.remaining));
  const soldOut = type.remaining === 0;
  const total = useMemo(
    () => (BigInt(type.priceAmount) * BigInt(quantity)).toString(),
    [type.priceAmount, quantity],
  );
  const namesComplete =
    !type.named ||
    Array.from({ length: quantity }).every((_, i) => (names[i] ?? '').trim().length > 0);
  const onlineBlocked = type.paymentMode === 'online';
  // One input per ticket, identified by its position: names belong to a seat, not to a list index.
  const holderSlots = Array.from({ length: quantity }, (_, index) => ({
    index,
    position: index + 1,
    id: `holder-${type.id}-${index + 1}`,
  }));

  const submit = () => {
    const payWith = needsChoice(type) ? choice : undefined;
    const input: OrderInput = {
      eventId: eventId as OrderInput['eventId'],
      lines: [
        {
          ticketTypeId: type.id,
          quantity,
          ...(payWith && { payWith }),
          ...(type.named && {
            holders: Array.from({ length: quantity }, (_, i) => ({
              name: (names[i] ?? '').trim(),
            })),
          }),
        },
      ],
    };
    const fingerprint = JSON.stringify(input);
    if (key.current?.fingerprint !== fingerprint)
      key.current = { fingerprint, value: newIdempotencyKey() };
    place.mutate({ input, key: key.current.value });
  };

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{type.name}</Text>
          {type.description ? (
            <Text className="text-sm text-muted-foreground">{type.description}</Text>
          ) : null}
          <Text className="mt-1 text-xs text-muted-foreground">
            {t(PAYMENT_LABEL[type.paymentMode])}
          </Text>
        </View>
        <Text className="text-base font-bold text-foreground">
          {BigInt(type.priceAmount) === 0n
            ? t('event.free')
            : formatMoney(type.priceAmount, type.currency, i18n.language)}
        </Text>
      </View>

      {soldOut ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-warning">{t('event.soldOut')}</Text>
          {signedIn ? (
            <Button
              tone="neutral"
              appearance="subtle"
              disabled={waitlist.join.isPending || waitlist.join.isSuccess}
              onPress={() => waitlist.join.mutate({ ticketTypeId: type.id, quantity: 1 })}
            >
              {waitlist.join.isSuccess
                ? t('event.onWaitlist', { position: waitlist.join.data?.position ?? '' })
                : t('event.joinWaitlist')}
            </Button>
          ) : null}
          {waitlist.join.isError ? (
            <Text className="text-sm text-destructive">{errorMessage(waitlist.join.error, t)}</Text>
          ) : null}
        </View>
      ) : place.isSuccess ? (
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground">{t('buy.done')}</Text>
          <Text className="text-sm text-muted-foreground">{t('buy.doneHint')}</Text>
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">{t('buy.quantity')}</Text>
            <View className="flex-row items-center gap-3">
              <Button
                tone="neutral"
                appearance="subtle"
                size="sm"
                accessibilityLabel="-"
                disabled={quantity <= 1}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                -
              </Button>
              <Text className="min-w-6 text-center text-base font-semibold text-foreground">
                {quantity}
              </Text>
              <Button
                tone="neutral"
                appearance="subtle"
                size="sm"
                accessibilityLabel="+"
                disabled={quantity >= max}
                onPress={() => setQuantity((q) => Math.min(max, q + 1))}
              >
                +
              </Button>
            </View>
          </View>
          {type.perPersonLimit < type.remaining ? (
            <Text className="text-xs text-muted-foreground">
              {t('buy.limit', { n: type.perPersonLimit })}
            </Text>
          ) : null}

          {needsChoice(type) ? (
            <View className="gap-1">
              <Text className="text-sm text-muted-foreground">{t('payment.choose')}</Text>
              <SegmentedControl
                label={t('payment.choose')}
                type="radio"
                value={choice}
                onValueChange={(v) => setChoice(v as Choice)}
              >
                <SegmentedControlItem value="door">
                  <SegmentedControlItemText>{t('payment.door')}</SegmentedControlItemText>
                </SegmentedControlItem>
                <SegmentedControlItem value="online">
                  <SegmentedControlItemText>{t('payment.online')}</SegmentedControlItemText>
                </SegmentedControlItem>
              </SegmentedControl>
              {choice === 'online' ? (
                <Text className="text-xs text-muted-foreground">{t('payment.onlineSoon')}</Text>
              ) : null}
            </View>
          ) : onlineBlocked ? (
            <Text className="text-xs text-muted-foreground">{t('payment.onlineSoon')}</Text>
          ) : null}

          {type.named
            ? holderSlots.map((slot) => (
                <TextField key={slot.id}>
                  <TextFieldInput
                    label={t('buy.holderName', { n: slot.position })}
                    value={names[slot.index] ?? ''}
                    onChangeText={(text) =>
                      setNames((prev) => {
                        const next = [...prev];
                        next[slot.index] = text;
                        return next;
                      })
                    }
                  />
                </TextField>
              ))
            : null}

          {BigInt(type.priceAmount) > 0n ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-muted-foreground">{t('buy.total')}</Text>
              <Text className="text-base font-bold text-foreground">
                {formatMoney(total, type.currency, i18n.language)}
              </Text>
            </View>
          ) : null}
          {type.paymentMode === 'door' || (needsChoice(type) && choice === 'door') ? (
            <Text className="text-xs text-muted-foreground">
              {t('buy.payAtDoor', { amount: formatMoney(total, type.currency, i18n.language) })}
            </Text>
          ) : null}

          {signedIn ? (
            <Button
              appearance="solid"
              tone="accent"
              size="lg"
              disabled={
                place.isPending ||
                !namesComplete ||
                onlineBlocked ||
                (needsChoice(type) && choice === 'online')
              }
              onPress={submit}
            >
              {place.isPending ? t('buy.reserving') : t('buy.reserve')}
            </Button>
          ) : (
            <Button
              appearance="solid"
              tone="accent"
              size="lg"
              onPress={() => void signIn().catch(() => undefined)}
            >
              {t('buy.signInToBuy')}
            </Button>
          )}
          {place.isError ? (
            <Text className="text-sm text-destructive">{errorMessage(place.error, t)}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
