import { useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button } from "@/ui/Button";
import { TaskPage, TaskSection } from "@/ui/shells/TaskPage";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { goBack } from "@/ui/navigate";

const BODY = "text-[15px] leading-[22px] text-foreground-secondary";

/**
 * The kit's task page demo: /dev/task (and an optional title). Has a text field to check that the keyboard does not
 * cover it, and Save for the success haptic and the confirmation.
 */
export default function SheetDemo() {
  const { title = "How Recovery works" } = useLocalSearchParams<{ title?: string }>();
  const { c } = useTheme();
  const [saved, setSaved] = useState(false);
  return (
    <TaskPage
      title={title}
      description="Updated each morning"
      done={saved ? { title: "Saved", body: "Have a great day!", onDone: goBack } : null}
      footer={
        <>
          <Button onPress={() => setSaved(true)}>Save</Button>
          <Button variant="outline-pill" onPress={goBack}>Cancel</Button>
        </>
      }
    >
      <View className="gap-4">
        <TaskSection>Why</TaskSection>
        <Text className={BODY}>Recovery shows how ready your body is to take on strain, from 0 to 100%. Pulse scores it each morning from last night&apos;s heart rate variability, resting heart rate, respiratory rate, sleep performance and skin temperature, each compared with your own baseline.</Text>
        <Text className={BODY}>Recovery shows from the second night and stays provisional until your data spans 60 days.</Text>
        <TaskSection>Note</TaskSection>
        <TextInput
          accessibilityLabel="Note"
          placeholder="Type here to try the keyboard"
          placeholderTextColor={c["muted-foreground"]}
          multiline
          className="min-h-24 rounded-xl bg-secondary px-4 py-3 text-[15px] leading-[22px] text-foreground"
          textAlignVertical="top"
        />
      </View>
    </TaskPage>
  );
}
