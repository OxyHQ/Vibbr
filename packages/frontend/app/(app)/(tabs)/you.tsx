import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@oxy.so/bloom/button';
import {
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlItemText,
} from '@oxy.so/bloom/segmented-control';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useViewer } from '@/hooks/useViewer';
import { SUPPORTED_LANGUAGES } from '@/lib/config';
import { setLanguage } from '@/lib/i18n';

export default function You() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { signedIn, signOut, user } = useViewer();
  return (
    <View className="flex-1 gap-6 bg-background p-4" style={{ paddingTop: insets.top + 16 }}>
      <Text className="text-2xl font-bold text-foreground">{t('you.title')}</Text>
      {signedIn ? (
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground">{user?.username ?? ''}</Text>
          <Button tone="neutral" appearance="subtle" onPress={() => void signOut()}>
            {t('you.signOut')}
          </Button>
        </View>
      ) : (
        <SignInPrompt message={t('you.signedOut')} />
      )}
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">{t('you.language')}</Text>
        <SegmentedControl
          label={t('you.language')}
          type="radio"
          value={i18n.language}
          onValueChange={(v) => void setLanguage(v)}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <SegmentedControlItem key={l} value={l}>
              <SegmentedControlItemText>
                {l.split('-')[0]?.toUpperCase() ?? l}
              </SegmentedControlItemText>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </View>
    </View>
  );
}
