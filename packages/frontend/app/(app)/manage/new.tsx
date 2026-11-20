import { EVENT_CATEGORIES, type EventInput } from '@vibbr.co/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
import { Button } from '@oxy.so/bloom/button';
import { Chip } from '@oxy.so/bloom/chip';
import { DatePicker } from '@oxy.so/bloom/date-picker';
import { Field } from '@oxy.so/bloom/field';
import {
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlItemText,
} from '@oxy.so/bloom/segmented-control';
import { TextField, TextFieldInput } from '@oxy.so/bloom/text-field';
import { Textarea } from '@oxy.so/bloom/textarea';
import { FieldError, Section } from '@/components/FormRow';
import { keys } from '@/hooks/queries';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { deviceTimeZone, parseTime, wallTimeToUtc } from '@/lib/zonedTime';

type Mode = 'in_person' | 'online' | 'hybrid';

export default function NewEvent() {
  const { organizerId } = useLocalSearchParams<{ organizerId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof EVENT_CATEGORIES)[number]>('music');
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState('20:00');
  const [zone, setZone] = useState(deviceTimeZone());
  const [mode, setMode] = useState<Mode>('in_person');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [capacity, setCapacity] = useState('');

  const clock = parseTime(time);
  const needsVenue = mode !== 'online';
  const needsLink = mode !== 'in_person';
  const valid =
    title.trim().length > 0 &&
    day !== null &&
    clock !== null &&
    (!needsVenue || (venueName.trim() && city.trim() && /^[A-Za-z]{2}$/.test(country))) &&
    (!needsLink || /^https?:\/\//.test(onlineUrl)) &&
    (capacity === '' || /^[1-9]\d{0,6}$/.test(capacity));

  const create = useMutation({
    mutationFn: async () => {
      if (!day || !clock || !organizerId) throw new Error('incomplete');
      let venueId: string | null = null;
      if (needsVenue) {
        const venue = await api.venues.create({
          name: venueName.trim(),
          addressLine: address.trim() || null,
          city: city.trim(),
          region: null,
          countryCode: country.toUpperCase(),
          timeZone: zone,
          location: null,
          capacity: null,
        });
        venueId = venue.id;
      }
      const startsAt = wallTimeToUtc(
        day.getFullYear(),
        day.getMonth() + 1,
        day.getDate(),
        clock.hour,
        clock.minute,
        zone,
      );
      const input: EventInput = {
        organizerId: organizerId as EventInput['organizerId'],
        title: title.trim(),
        summary: summary.trim() || null,
        description: description.trim() || null,
        category,
        tags: [],
        timeZone: zone,
        startsAt: startsAt.toISOString(),
        endsAt: null,
        place: { mode, venueId: venueId as never, onlineUrl: needsLink ? onlineUrl.trim() : null },
        capacity: capacity ? Number(capacity) : null,
        lineup: [],
      };
      return api.manage.createEvent(input);
    },
    onSuccess: (event) => {
      void client.invalidateQueries({ queryKey: keys.managed(organizerId ?? '') });
      router.replace(`/manage/${event.id}`);
    },
  });

  return (
    <Screen header={<PageHeader title={t('manage.newEvent')} />}>
      <ScreenScrollView contentContainerClassName="pb-10">
        <View className="mx-auto w-full max-w-[640px] gap-6 p-4">
          <Section title={t('manage.eventTitle')}>
            <TextField>
              <TextFieldInput
                label={t('manage.eventTitle')}
                value={title}
                onChangeText={setTitle}
                maxLength={200}
              />
            </TextField>
            <TextField>
              <TextFieldInput
                label={t('manage.summary')}
                value={summary}
                onChangeText={setSummary}
                maxLength={500}
              />
            </TextField>
            <Textarea
              label={t('manage.description')}
              value={description}
              onValueChange={setDescription}
            />
          </Section>

          <Section title={t('manage.category')}>
            <View className="flex-row flex-wrap gap-2">
              {EVENT_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  variant={category === c ? 'solid' : 'subtle'}
                  onPress={() => setCategory(c)}
                >
                  {t(`category.${c}`)}
                </Chip>
              ))}
            </View>
          </Section>

          <Section title={t('manage.starts')}>
            <View className="flex-row gap-3">
              <Field label={t('manage.starts')} style={{ flex: 1 }}>
                <DatePicker value={day} onChange={setDay} accessibilityLabel={t('manage.starts')} />
              </Field>
              <View style={{ width: 120 }}>
                <TextField>
                  <TextFieldInput
                    label="HH:mm"
                    value={time}
                    onChangeText={setTime}
                    keyboardType="numbers-and-punctuation"
                  />
                </TextField>
              </View>
            </View>
            <TextField>
              <TextFieldInput
                label={t('manage.timeZone')}
                value={zone}
                onChangeText={setZone}
                autoCapitalize="none"
              />
            </TextField>
            <FieldError message={clock === null ? t('manage.startsHint') : null} />
          </Section>

          <Section title={t('manage.mode')}>
            <SegmentedControl
              label={t('manage.mode')}
              type="radio"
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
            >
              <SegmentedControlItem value="in_person">
                <SegmentedControlItemText>{t('manage.mode_in_person')}</SegmentedControlItemText>
              </SegmentedControlItem>
              <SegmentedControlItem value="online">
                <SegmentedControlItemText>{t('manage.mode_online')}</SegmentedControlItemText>
              </SegmentedControlItem>
              <SegmentedControlItem value="hybrid">
                <SegmentedControlItemText>{t('manage.mode_hybrid')}</SegmentedControlItemText>
              </SegmentedControlItem>
            </SegmentedControl>
            {needsVenue ? (
              <>
                <TextField>
                  <TextFieldInput
                    label={t('manage.venueName')}
                    value={venueName}
                    onChangeText={setVenueName}
                  />
                </TextField>
                <TextField>
                  <TextFieldInput
                    label={t('manage.address')}
                    value={address}
                    onChangeText={setAddress}
                  />
                </TextField>
                <View className="flex-row gap-3">
                  <View style={{ flex: 1 }}>
                    <TextField>
                      <TextFieldInput
                        label={t('manage.city')}
                        value={city}
                        onChangeText={setCity}
                      />
                    </TextField>
                  </View>
                  <View style={{ width: 120 }}>
                    <TextField>
                      <TextFieldInput
                        label={t('manage.country')}
                        value={country}
                        onChangeText={setCountry}
                        autoCapitalize="characters"
                        maxLength={2}
                      />
                    </TextField>
                  </View>
                </View>
              </>
            ) : null}
            {needsLink ? (
              <TextField>
                <TextFieldInput
                  label={t('manage.onlineUrl')}
                  value={onlineUrl}
                  onChangeText={setOnlineUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </TextField>
            ) : null}
            <TextField>
              <TextFieldInput
                label={t('manage.capacity')}
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="number-pad"
              />
            </TextField>
          </Section>

          <Button
            appearance="solid"
            tone="accent"
            size="lg"
            disabled={!valid || create.isPending}
            onPress={() => create.mutate()}
          >
            {t('manage.save')}
          </Button>
          <FieldError message={create.isError ? errorMessage(create.error, t) : null} />
          <Text className="text-xs text-muted-foreground">{t('manage.draft')}</Text>
        </View>
      </ScreenScrollView>
    </Screen>
  );
}
