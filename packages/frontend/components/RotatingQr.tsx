import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '@/lib/api';

/**
 * The ticket's admission code. The server mints a short-lived signed code; this
 * asks for a fresh one shortly before the current one lapses, so a screenshot
 * of it stops working within a minute.
 */
export function RotatingQr({ ticketId, size = 240 }: { ticketId: string; size?: number }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await api.tickets.code(ticketId);
        if (cancelled) return;
        setCode(next.code);
        setFailed(false);
        // Refresh at 15 s: the server's code verifies for the window it was minted in and the next.
        timer = setTimeout(load, 15_000);
      } catch {
        if (cancelled) return;
        setFailed(true);
        timer = setTimeout(load, 5_000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ticketId]);

  return (
    <View className="items-center gap-3">
      <View className="rounded-2xl bg-white p-4">
        {code ? (
          <QRCode value={code} size={size} />
        ) : (
          <View style={{ width: size, height: size }} />
        )}
      </View>
      <Text className="text-center text-xs text-muted-foreground">
        {failed ? t('errors.network') : t('tickets.codeHint')}
      </Text>
    </View>
  );
}
