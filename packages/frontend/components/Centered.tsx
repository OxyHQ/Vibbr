import { ActivityIndicator, View } from 'react-native';
import { EmptyState } from '@oxy.so/bloom/empty-state';
import { RiCalendarEventLine } from '@oxy.so/bloom/icons/RiCalendarEventLine';

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <ActivityIndicator />
    </View>
  );
}

export function Problem({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <EmptyState
        icon={RiCalendarEventLine}
        title={title}
        description={description}
        action={action}
      />
    </View>
  );
}
