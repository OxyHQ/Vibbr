import type { Event, OrganizerInput } from '@vibbr.co/contracts';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import {
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlItemText,
} from '@oxy.so/bloom/segmented-control';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { Loading, Problem } from '@/components/Centered';
import { FieldError } from '@/components/FormRow';
import { SignInPrompt } from '@/components/SignInPrompt';
import { keys, useManagedEvents, useMyOrganizers } from '@/hooks/queries';
import { useViewer } from '@/hooks/useViewer';
import { api } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatEventWhen } from '@/lib/format';

const KINDS = ['person', 'artist', 'company', 'venue', 'community'] as const;
const HANDLE = /^[a-z0-9_]{3,30}$/;

function OrganizerForm() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('person');
  const create = useMutation({
    mutationFn: (input: OrganizerInput) => api.organizers.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.organizers }),
  });
  const handleOk = HANDLE.test(handle);
  return (
    <ScrollView contentContainerClassName="mx-auto w-full max-w-[520px] gap-4 p-4">
      <Text className="text-2xl font-bold text-foreground">{t('manage.createOrganizer')}</Text>
      <SegmentedControl
        label={t('manage.organizerKind')}
        type="radio"
        value={kind}
        onValueChange={(v) => setKind(v as (typeof KINDS)[number])}
      >
        {KINDS.map((k) => (
          <SegmentedControlItem key={k} value={k}>
            <SegmentedControlItemText>{t(`manage.kind.${k}`)}</SegmentedControlItemText>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <TextField>
        <TextFieldInput
          label={t('manage.organizerName')}
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
      </TextField>
      <TextField>
        <TextFieldInput
          label={t('manage.organizerHandle')}
          value={handle}
          onChangeText={(v) => setHandle(v.toLowerCase())}
          autoCapitalize="none"
          maxLength={30}
        />
      </TextField>
      <Button
        appearance="solid"
        tone="accent"
        size="lg"
        disabled={!name.trim() || !handleOk || create.isPending}
        onPress={() => create.mutate({ kind, name: name.trim(), handle })}
      >
        {t('manage.save')}
      </Button>
      <FieldError
        message={
          create.isError
            ? errorCode(create.error) === 'conflict'
              ? t('errors.conflict')
              : errorMessage(create.error, t)
            : null
        }
      />
    </ScrollView>
  );
}

function EventRow({ event }: { event: Event }) {
  const { t, i18n } = useTranslation();
  return (
    <Link href={`/manage/${event.id}`} asChild>
      <Pressable
        accessibilityRole="link"
        className="mb-3 gap-1 rounded-2xl border border-border bg-card p-4"
      >
        <Text className="text-base font-semibold text-foreground">{event.title}</Text>
        <Text className="text-xs text-muted-foreground">
          {formatEventWhen(event.startsAt, event.timeZone, i18n.language)}
        </Text>
        <View className="mt-1 flex-row">
          <Chip
            variant="subtle"
            color={
              event.status === 'published'
                ? 'success'
                : event.status === 'cancelled'
                  ? 'error'
                  : 'default'
            }
          >
            {t(`manage.${event.status}`)}
          </Chip>
        </View>
      </Pressable>
    </Link>
  );
}

export default function Organize() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signedIn, ready } = useViewer();
  const organizers = useMyOrganizers(signedIn);
  const organizer = organizers.data?.[0];
  const events = useManagedEvents(organizer?.id);

  if (!ready) return <Loading />;
  if (!signedIn) return <SignInPrompt />;
  if (organizers.isPending) return <Loading />;
  if (organizers.isError)
    return (
      <Problem
        title={t('discover.error')}
        action={{ label: t('discover.retry'), onPress: () => void organizers.refetch() }}
      />
    );
  if (!organizer)
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <OrganizerForm />
      </View>
    );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Text className="text-2xl font-bold text-foreground">{organizer.name}</Text>
        <Button
          appearance="solid"
          tone="accent"
          size="sm"
          onPress={() =>
            router.push({ pathname: '/manage/new', params: { organizerId: organizer.id } })
          }
        >
          {t('manage.newEvent')}
        </Button>
      </View>
      {events.isPending ? (
        <Loading />
      ) : (events.data ?? []).length === 0 ? (
        <Problem title={t('manage.empty')} />
      ) : (
        <FlatList
          data={events.data}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventRow event={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        />
      )}
    </View>
  );
}
