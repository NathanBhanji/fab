import { UserButton, useAuth } from "@clerk/react";
import { LogInIcon } from "lucide-react";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { FAB_CONNECT_ACCOUNT_PAGES } from "./FabConnectAccountPages";
import { useFabConnectAuthPrompt } from "./useFabConnectAuthPrompt";

export function FabConnectSidebarSignIn() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredFabConnectSidebarSignIn />;
}

export function FabConnectSidebarAvatar() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredFabConnectSidebarAvatar />;
}

function ConfiguredFabConnectSidebarAvatar() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) return null;

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "size-7",
          // Clerk's unlayered trigger reset (padding, radius, background) beats layered utilities.
          userButtonTrigger: "mb-1! rounded-lg! p-1! hover:bg-sidebar-row-hover!",
        },
      }}
    >
      {FAB_CONNECT_ACCOUNT_PAGES.map((page) => (
        <UserButton.UserProfilePage
          key={page.url}
          label={page.label}
          labelIcon={page.icon}
          url={page.url}
        >
          {page.content}
        </UserButton.UserProfilePage>
      ))}
    </UserButton>
  );
}

function ConfiguredFabConnectSidebarSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const { openAuthPrompt } = useFabConnectAuthPrompt();

  if (!isLoaded || isSignedIn) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={openAuthPrompt}>
          <LogInIcon />
          <span>Sign in to Fab Connect</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
