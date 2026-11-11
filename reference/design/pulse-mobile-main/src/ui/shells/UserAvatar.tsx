// The owner's avatar (Home's header, Settings › Profile). Ported from pulse src/components/shells/UserAvatar.tsx: the
// photo in a circle with a faint outline, else the outline person icon. Mobile adds the name's initials between the two
// (spec, "Avatar"), since the web's fallback is the Google photo, which Pulse Mobile never has.
import { Image, View } from "react-native";
import { CircleUserRound } from "lucide-react-native";
import { initials } from "@/actions/profile";
import { useApp } from "@/state/app";
import { Icon } from "../Icon";
import { Text } from "../Text";

export function UserAvatar({ size }: { size: number }) {
  const photo = useApp((s) => s.profile?.photo ?? null);
  const letters = useApp((s) => initials(s.profile?.name));
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photo) return <Image source={{ uri: photo }} accessibilityIgnoresInvertColors style={box} className="border border-foreground/10" />;
  if (letters)
    return (
      <View style={box} className="items-center justify-center bg-foreground/8">
        <Text className="font-bold text-foreground" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {letters}
        </Text>
      </View>
    );
  return <Icon icon={CircleUserRound} size={size} tone="foreground" strokeWidth={1.5} />;
}
