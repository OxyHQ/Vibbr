import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button } from '@oxy.so/bloom/button';
import { useViewer } from '@/hooks/useViewer';

export function SignInPrompt({ message }: { message?: string }) {
  const { t } = useTranslation();
  const { signIn } = useViewer();
  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      <Text className="text-center text-base text-muted-foreground">
        {message ?? t('auth.signInPrompt')}
      </Text>
      <Button
        appearance="solid"
        tone="accent"
        size="lg"
        onPress={() => void signIn().catch(() => undefined)}
      >
        {t('auth.signIn')}
      </Button>
    </View>
  );
}
