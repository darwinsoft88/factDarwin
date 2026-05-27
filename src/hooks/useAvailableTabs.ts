import { useEffect, useMemo } from "react";
import { AppLicense, User } from "../types";
import { AppTab, filterTabsByLicense, tabsForRole } from "../utils/appAccess";

type UseAvailableTabsParams = {
  activeTab: AppTab;
  license?: AppLicense;
  session: User | null;
  onTabChange: (tab: AppTab) => void;
};

export function useAvailableTabs({ activeTab, license, session, onTabChange }: UseAvailableTabsParams) {
  const availableTabs = useMemo<AppTab[]>(() => {
    if (!session) return [];
    return filterTabsByLicense(tabsForRole(session.role), license, session.role);
  }, [license, session]);

  useEffect(() => {
    if (session && !availableTabs.includes(activeTab)) {
      onTabChange("dashboard");
    }
  }, [activeTab, availableTabs, onTabChange, session]);

  return availableTabs;
}
