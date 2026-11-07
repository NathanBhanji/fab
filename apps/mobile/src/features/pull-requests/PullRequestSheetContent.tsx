import { SheetHeader } from "../../components/ui/SheetHeader";
import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { NativeStackScreenOptions } from "../../native/StackHeader";

export function PullRequestSheetContent(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const footer = props.footer ? (
    <View className="bg-sheet px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
      {props.footer}
    </View>
  ) : null;
  return (
    <KeyboardAvoidingView
      automaticOffset
      behavior="padding"
      collapsable={false}
      className="bg-sheet ios:flex-1"
    >
      <NativeStackScreenOptions options={{ gestureEnabled: !props.busy }} />
      <SheetHeader
        presentation="native"
        title={props.title}
        subtitle={props.subtitle}
        onCancel={() => navigation.goBack()}
        dismissDisabled={props.busy}
      />
      <ScreenContent>
        <ScrollView
          nestedScrollEnabled
          className="ios:flex-1"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}
        >
          <View className="gap-4" pointerEvents={props.busy ? "none" : "auto"}>
            {props.children}
          </View>
        </ScrollView>
        {footer}
      </ScreenContent>
    </KeyboardAvoidingView>
  );
}
