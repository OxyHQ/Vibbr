import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { EmptyState } from '@oxy.so/bloom/empty-state';
import { EmptyStateSticker } from '@/components/EmptyStateSticker';
import { useViewer } from '@/hooks/useViewer';

/** Asks a signed-out visitor to sign in; `message` says what signing in unlocks on this screen. */
export function SignInPrompt({ message }: { message?: string }) {
  const { t } = useTranslation();
  const { signIn } = useViewer();
  return (
    <View className="flex-1 items-center justify-center p-6">
      <EmptyState
        illustration={<EmptyStateSticker name="signIn" />}
        title={t('auth.title')}
        description={message ?? t('auth.subtitle')}
        action={{
          label: t('auth.signIn'),
          onPress: () => void signIn().catch(() => undefined),
        }}
      />
    </View>
  );
}
