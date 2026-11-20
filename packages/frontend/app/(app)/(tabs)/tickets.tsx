import type { Ticket } from '@vibbr.co/contracts';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Chip } from '@oxy.so/bloom/chip';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { Loading, Problem } from '@/components/Centered';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useMyTickets } from '@/hooks/queries';
import { useViewer } from '@/hooks/useViewer';

const STATUS_COLOR = {
  valid: 'success',
  used: 'default',
  listed: 'warning',
  cancelled: 'error',
} as const;

function TicketRow({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation();
  return (
    <Link href={`/tickets/${ticket.id}`} asChild>
      <Pressable
        accessibilityRole="link"
        className="flex-row items-center justify-between rounded-2xl border border-border bg-card p-4"
      >
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground">
            {ticket.holderName ?? t('tickets.show')}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {t(`payment.${ticket.paymentChoice}`)}
          </Text>
        </View>
        <Chip variant="subtle" color={STATUS_COLOR[ticket.status]}>
          {t(`tickets.${ticket.status}`)}
        </Chip>
      </Pressable>
    </Link>
  );
}

export default function Tickets() {
  const { t } = useTranslation();
  const { signedIn, ready } = useViewer();
  const tickets = useMyTickets(signedIn);
  return (
    <Screen header={<PageHeader title={t('tickets.title')} />}>
      <ScreenScrollView contentContainerClassName="gap-3 p-4">
        {!ready ? (
          <Loading />
        ) : !signedIn ? (
          <SignInPrompt />
        ) : tickets.isPending ? (
          <Loading />
        ) : tickets.isError ? (
          <Problem
            title={t('discover.error')}
            action={{ label: t('discover.retry'), onPress: () => void tickets.refetch() }}
          />
        ) : (tickets.data ?? []).length === 0 ? (
          <Problem title={t('tickets.empty')} description={t('tickets.emptyHint')} />
        ) : (
          tickets.data.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
        )}
      </ScreenScrollView>
    </Screen>
  );
}
