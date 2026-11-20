import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * Vibbr's brand mark: a ticket with a star. Not an icon: glyphs come from Bloom
 * (`@oxy.so/bloom/icons`). Callers pass the resolved colour, as with a Bloom icon's `fill`.
 * It is drawn turned 180 degrees, as every Vibbr icon is.
 */
export function VibbrLogo({
  color,
  size = 28,
  style,
}: {
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size} style={style}>
      <G rotation={180} originX={24} originY={24}>
        <Path
          d="M19.9,30.65L24,27.4l4,3.15L26.45,25.6l4.15-3.25H25.65l-1.65-5l-1.65,5H17.4l4.1,3.25l-1.6,5.05ZM9.15,38.15q-1.4,0-2.38-0.98T5.8,34.8v-4q0-0.3 0.15-0.68t0.5-0.57Q8.05,28.7 9,27.28T9.95,24q0-1.9-0.95-3.33T6.45,18.4q-0.35-0.2-0.5-0.57T5.8,17.15v-4q0-1.4 0.97-2.38T9.15,9.8H38.9q1.4,0 2.38,0.98t0.97,2.38v4q0,0.3-0.15,0.68T41.65,18.4q-1.65,0.85-2.6,2.27T38.1,24q0,1.85 0.95,3.27t2.6,2.28q0.3,0.2 0.45,0.57t0.15,0.68v4q0,1.4-0.97,2.38T38.9,38.15H9.15Z"
          fill={color}
        />
      </G>
    </Svg>
  );
}
