import { View } from "react-native";

import { cn } from "../../lib/cn";
import { SymbolView } from "./AppSymbol";
import { ListRowLayout } from "./ListRowLayout";
import { RowPressable } from "./RowPressable";

export function ListChoiceRow(props: {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly separated?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <RowPressable
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityHint={props.description}
      accessibilityState={{ checked: props.selected, disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      // Like UIKit lists, only the checkmark marks the selected row.
      className={cn("bg-grouped-card", props.separated && "border-t border-border-subtle")}
    >
      <ListRowLayout
        label={props.label}
        description={props.description}
        disabled={props.disabled}
        accessory={
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="size-6 items-center justify-center"
          >
            {props.selected ? (
              <SymbolView
                name="checkmark"
                size={18}
                tintColorClassName="accent-primary-text"
                type="monochrome"
                weight="semibold"
              />
            ) : null}
          </View>
        }
      />
    </RowPressable>
  );
}
