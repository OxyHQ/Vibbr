import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('errors.not_found') }} />
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text className="text-xl font-bold text-foreground">{t('errors.not_found')}</Text>
        <Link href="/" className="text-base text-primary">
          {t('tabs.discover')}
        </Link>
      </View>
    </>
  );
}
