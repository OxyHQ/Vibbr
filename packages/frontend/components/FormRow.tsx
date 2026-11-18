import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

export function FieldError({ message }: { message: string | null }) {
  return message ? <Text className="text-sm text-destructive">{message}</Text> : null;
}
