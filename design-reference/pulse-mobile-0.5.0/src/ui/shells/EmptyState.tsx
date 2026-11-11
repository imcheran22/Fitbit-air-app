import { View } from "react-native";

import type { LucideIcon } from "lucide-react-native";
import { Button } from "../Button";
import { cn } from "../cn";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { push } from "../navigate";

export type EmptyStateProps = {
  icon?: LucideIcon;
  /** One line, final copy from the spec. */
  body: string;
  /** `href` opens a route; `sheet` opens that sheet over the screen (the check-in); `onClick` runs a function. */
  action?: { label: string; href?: string; sheet?: string; onClick?: () => void };
  className?: string;
};

/** Shared empty state for metrics and lists (spec §4.8). */
export function EmptyState({ icon, body, action, className }: EmptyStateProps) {
  return (
    <View className={cn("items-center gap-2 py-8", className)}>
      {icon && <Icon icon={icon} size={24} tone="muted-foreground" />}
      <Text className="max-w-72 text-center text-[15px] leading-[22px] text-foreground-secondary">{body}</Text>
      {action && (
        <Button
          variant="secondary"
          className="mt-2"
          onPress={() => (action.sheet ? push(action.sheet) : action.href ? push(action.href) : action.onClick?.())}
        >
          {action.label}
        </Button>
      )}
    </View>
  );
}
