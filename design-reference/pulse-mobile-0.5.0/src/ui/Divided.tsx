import { Children, Fragment, type ReactNode } from "react";
import { View } from "react-native";

/**
 * The web's `divide-y divide-border`: a hairline between neighbouring children. One View, so a parent's `gap` falls
 * around the list, not between every row and hairline (a fragment let it pad each row of the training cards).
 */
export function Divided({ children }: { children: ReactNode }) {
  return (
    <View>
      {Children.toArray(children).map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View className="h-px bg-border" />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}
