import { StackActions, useNavigation } from "@react-navigation/native";

export function useWorkspaceBackNavigation() {
  const navigation = useNavigation();
  return () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.dispatch(StackActions.replace("Home"));
  };
}
