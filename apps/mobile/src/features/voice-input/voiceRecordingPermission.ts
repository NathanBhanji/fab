import { requestRecordingPermissionsAsync } from "expo-audio";
import { AppState } from "react-native";

export function createVoiceRecordingPermission(onBackground: () => void) {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") onBackground();
  });
  return {
    requestPermission: () => requestRecordingPermissionsAsync(),
    dispose: () => subscription.remove(),
  };
}
