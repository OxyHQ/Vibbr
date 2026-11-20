import { ActivityIndicator, View } from 'react-native';
import { EmptyState } from '@oxy.so/bloom/empty-state';
import { EmptyStateSticker } from '@/components/EmptyStateSticker';
import type { EmptyStateStickerName } from '@/lib/stickers';

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <ActivityIndicator />
    </View>
  );
}

/**
 * An empty or failed state, drawn by Bloom with a sticker from Oxy's catalogue above it. The
 * sticker is required so no state ships without its own character.
 */
export function Problem({
  title,
  description,
  action,
  sticker,
}: {
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  sticker: EmptyStateStickerName;
}) {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <EmptyState
        illustration={<EmptyStateSticker name={sticker} />}
        title={title}
        description={description}
        action={action}
      />
    </View>
  );
}
