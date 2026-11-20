import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button } from '@oxy.so/bloom/button';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Screen, ScreenScrollView } from '@oxy.so/bloom/screen';
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
  const { signedIn, signOut, user } = useViewer();
  return (
    <Screen header={<PageHeader title={t('you.title')} />}>
      <ScreenScrollView contentContainerClassName="gap-6 p-4">
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
      </ScreenScrollView>
    </Screen>
  );
}
