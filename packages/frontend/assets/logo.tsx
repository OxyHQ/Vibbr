import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * Vibbr's brand mark: a ticket with its tear-off line. Not an icon: glyphs come from Bloom
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
    <Svg viewBox="0 0 24 24" width={size} height={size} style={style}>
      <G rotation={180} originX={12} originY={12}>
        <Path
          d="M12.04,17.29q0.54,0 0.9-0.36t0.37-0.89t-0.36-0.9t-0.9-0.37q-0.53,0-0.9,0.36t-0.37,0.9q0,0.53 0.36,0.89t0.89,0.37Zm0-4.07q0.54,0 0.9-0.36t0.37-0.89t-0.36-0.9t-0.9-0.37q-0.53,0-0.9,0.36t-0.37,0.9q0,0.53 0.36,0.9t0.89,0.37Zm0-4.08q0.54,0 0.9-0.36t0.37-0.89q0-0.54-0.36-0.9t-0.9-0.36q-0.53,0-0.9,0.36T10.78,7.87q0,0.53 0.36,0.9t0.89,0.37ZM20.1,20.85H3.95q-1.2,0-2.01-0.82T1.12,18.02V13.46q0.79,0 1.42-0.35T3.15,12q0-0.78-0.62-1.14T1.12,10.49V5.95q0-1.2 0.82-2.01T3.95,3.12H20.1q1.2,0 2.01,0.82t0.82,2.01v4.55q-0.79,0-1.42,0.37T20.88,12q0,0.77 0.63,1.12t1.42,0.35v4.55q0,1.2-0.82,2.01T20.1,20.85Z"
          fill={color}
        />
      </G>
    </Svg>
  );
}
