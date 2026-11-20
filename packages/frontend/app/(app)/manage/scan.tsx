import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { ScanResult } from '@vibbr.co/contracts';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen } from '@oxy.so/bloom/screen';
import { Button } from '@oxy.so/bloom/button';
import { api } from '@/lib/api';
import { errorStatus } from '@/lib/errors';
import { ScanQueue } from '@/lib/scanQueue';

const RESULT_TONE: Record<ScanResult['result'], string> = {
  admitted: 'bg-green-600',
  already_used: 'bg-amber-600',
  invalid: 'bg-red-600',
  wrong_event: 'bg-red-600',
  cancelled: 'bg-red-600',
  expired_code: 'bg-amber-600',
};

export default function Scanner() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, setPending] = useState(0);
  const [queued, setQueued] = useState(false);
  const busy = useRef(false);
  const queue = useMemo(
    () => new ScanQueue(AsyncStorage, `vibbr:scan-queue:${eventId}`),
    [eventId],
  );

  const syncPending = useCallback(async () => {
    try {
      await queue.flush(async (batch) => {
        await api.door.scanBatch(eventId, [...batch]);
      });
    } catch {
      // Still offline: the scans stay queued.
    }
    setPending(await queue.size());
  }, [queue, eventId]);

  useEffect(() => {
    void syncPending();
    return NetInfo.addEventListener((state) => {
      if (state.isConnected !== false) void syncPending();
    });
  }, [syncPending]);

  const onScanned = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const scannedAt = new Date().toISOString();
        try {
          setResult(await api.door.scan(eventId, code, scannedAt));
        } catch (error) {
          // No answer at all means no connection: keep the read and admit nobody blindly.
          if (errorStatus(error) !== undefined) throw error;
          await queue.add({ code, scannedAt });
          setPending(await queue.size());
          setQueued(true);
        }
      } finally {
        busy.current = false;
      }
    },
    [eventId, queue],
  );

  if (!permission) return <View className="flex-1 bg-background" />;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="text-center text-base text-foreground">{t('scan.permission')}</Text>
        <Button appearance="solid" tone="accent" onPress={() => void requestPermission()}>
          {t('scan.allow')}
        </Button>
      </View>
    );
  }

  return (
    <Screen scroll="none" header={<PageHeader title={t('scan.title')} />}>
      <View className="flex-1 bg-black">
        {queued ? (
          <View className="flex-1 items-center justify-center gap-3 bg-amber-600 p-6">
            <Text className="text-center text-3xl font-bold text-white">{t('scan.queued')}</Text>
            <Text className="text-center text-base text-white/90">{t('scan.queuedHint')}</Text>
            <Button appearance="solid" tone="neutral" size="lg" onPress={() => setQueued(false)}>
              {t('scan.next')}
            </Button>
          </View>
        ) : result ? (
          <View
            className={`flex-1 items-center justify-center gap-3 p-6 ${RESULT_TONE[result.result]}`}
          >
            <Text className="text-center text-3xl font-bold text-white">
              {t(`scan.${result.result}`)}
            </Text>
            {result.holderName ? (
              <Text className="text-xl text-white">{result.holderName}</Text>
            ) : null}
            {result.ticketTypeName ? (
              <Text className="text-base text-white/90">{result.ticketTypeName}</Text>
            ) : null}
            <Button appearance="solid" tone="neutral" size="lg" onPress={() => setResult(null)}>
              {t('scan.next')}
            </Button>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => void onScanned(data)}
            />
            <View className="absolute bottom-8 left-0 right-0 items-center gap-2">
              <Text className="rounded-full bg-black/60 px-4 py-2 text-white">
                {t('scan.hint')}
              </Text>
              {pending > 0 ? (
                <Text className="rounded-full bg-amber-600 px-4 py-2 text-white">
                  {t('scan.offline', { n: pending })}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
