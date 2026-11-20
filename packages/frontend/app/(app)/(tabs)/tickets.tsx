import type { Ticket } from '@vibbr.co/contracts';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@oxy.so/bloom/chip';
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
        className="mb-3 flex-row items-center justify-between rounded-2xl border border-border bg-card p-4"
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
  const insets = useSafeAreaInsets();
  const { signedIn, ready } = useViewer();
  const tickets = useMyTickets(signedIn);
  if (!ready) return <Loading />;
  if (!signedIn) return <SignInPrompt />;
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Text className="px-4 pb-2 pt-4 text-2xl font-bold text-foreground">
        {t('tickets.title')}
      </Text>
      {tickets.isPending ? (
        <Loading />
      ) : tickets.isError ? (
        <Problem
          title={t('discover.error')}
          action={{ label: t('discover.retry'), onPress: () => void tickets.refetch() }}
        />
      ) : (tickets.data ?? []).length === 0 ? (
        <Problem title={t('tickets.empty')} description={t('tickets.emptyHint')} />
      ) : (
        <FlatList
          data={tickets.data}
          keyExtractor={(ticket) => ticket.id}
          renderItem={({ item }) => <TicketRow ticket={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
          refreshing={tickets.isRefetching}
          onRefresh={() => void tickets.refetch()}
        />
      )}
    </View>
  );
}
