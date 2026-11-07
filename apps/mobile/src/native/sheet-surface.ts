export const HORIZONTAL_FORM_SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetPrefersHorizontalBars: true,
};

export function formSheetDetents(initialDetent: number) {
  return [initialDetent, 1];
}
