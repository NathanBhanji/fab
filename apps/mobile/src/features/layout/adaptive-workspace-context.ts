import type { WorkspaceTab } from "../workspace/workspace-tabs-state";
import { createContext, use, type ReactNode } from "react";
import type { WorkspaceDetail } from "../workspace/workspace-detail-selection";
import {
  deriveFileInspectorPaneLayout,
  deriveLayout,
  deriveWorkspacePaneLayout,
  type FileInspectorPaneLayout,
  type Layout,
  type WorkspaceAuxiliaryPaneRole,
  type WorkspacePaneLayout,
} from "../../lib/layout";

interface AdaptiveWorkspaceContextValue {
  readonly layout: Layout;
  readonly panes: WorkspacePaneLayout;
  readonly fileInspector: FileInspectorPaneLayout;
  readonly startNewTask: () => void;
  /** Use `useSelectWorkspaceDetail`, which also works outside the layout. */
  readonly selectDetail?: (detail: WorkspaceDetail) => void;
  readonly activateAuxiliaryPaneRole: (role: WorkspaceAuxiliaryPaneRole) => () => void;
  readonly registerWorkspaceInspector: (render: () => ReactNode) => () => void;
  readonly showAuxiliaryPane: (role: WorkspaceAuxiliaryPaneRole) => void;
  readonly toggleAuxiliaryPane: () => void;
  readonly togglePrimarySidebar: () => void;
  readonly setPrimarySidebarVisible: (visible: boolean) => void;
  /** Opens a workspace tab with its list and, with columns, the page it last showed. */
  readonly openWorkspaceTab: (
    tab: WorkspaceTab | "settings",
    options?: { readonly columns?: boolean },
  ) => void;
  readonly setAuxiliaryPaneWidth: (width: number) => void;
  /**
   * Whether the sidebar shows in each orientation, where it floats over the content in portrait
   * (the unfolded Duo). The native split switches between them as a rotation starts.
   */
  readonly sidebarByOrientation: { readonly landscape: boolean; readonly portrait: boolean } | null;
}

const compactLayout = deriveLayout({ width: 0, height: 0 });
const compactPanes = deriveWorkspacePaneLayout({
  layout: compactLayout,
  viewportWidth: 0,
  primarySidebarPreferredVisible: true,
  auxiliaryPanePreferredVisible: true,
});
const compactFileInspector = deriveFileInspectorPaneLayout({
  layout: compactLayout,
  viewportWidth: 0,
});
export const AdaptiveWorkspaceContext = createContext<AdaptiveWorkspaceContextValue>({
  layout: compactLayout,
  panes: compactPanes,
  fileInspector: compactFileInspector,
  startNewTask: () => undefined,
  activateAuxiliaryPaneRole: () => () => undefined,
  registerWorkspaceInspector: () => () => undefined,
  showAuxiliaryPane: () => undefined,
  toggleAuxiliaryPane: () => undefined,
  togglePrimarySidebar: () => undefined,
  setPrimarySidebarVisible: () => undefined,
  openWorkspaceTab: () => undefined,
  setAuxiliaryPaneWidth: () => undefined,
  sidebarByOrientation: null,
});

export function useAdaptiveWorkspaceLayout(): AdaptiveWorkspaceContextValue {
  return use(AdaptiveWorkspaceContext);
}
