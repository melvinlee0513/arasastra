import { useState, useEffect, useCallback } from "react";

const SIDEBAR_COLLAPSED_KEY = "arasa-admin-sidebar-collapsed";

export function useSidebarState(defaultCollapsed: boolean = false) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    // Initialize from localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    }
    return defaultCollapsed;
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return {
    collapsed,
    setCollapsed,
    toggle,
  };
}
