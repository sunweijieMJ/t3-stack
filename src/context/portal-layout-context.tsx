'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface PortalLayoutVisible {
  header: boolean;
}

export interface PortalLayoutContextType {
  layoutVisible: PortalLayoutVisible;
  setLayoutVisible: (visible: Partial<PortalLayoutVisible>) => void;
  resetLayout: () => void;
}

const DEFAULT: PortalLayoutVisible = { header: true };

const PortalLayoutContext = createContext<PortalLayoutContextType | null>(null);

export function PortalLayoutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layoutVisible, setLayoutVisibleState] = useState<PortalLayoutVisible>({
    ...DEFAULT,
  });

  const setLayoutVisible = useCallback(
    (visible: Partial<PortalLayoutVisible>) => {
      setLayoutVisibleState((prev) => ({ ...prev, ...visible }));
    },
    [],
  );

  const resetLayout = useCallback(
    () => setLayoutVisibleState({ ...DEFAULT }),
    [],
  );

  const value = useMemo<PortalLayoutContextType>(
    () => ({ layoutVisible, setLayoutVisible, resetLayout }),
    [layoutVisible, setLayoutVisible, resetLayout],
  );

  return (
    <PortalLayoutContext.Provider value={value}>
      {children}
    </PortalLayoutContext.Provider>
  );
}

export function usePortalLayout(): PortalLayoutContextType {
  const ctx = useContext(PortalLayoutContext);
  if (!ctx)
    throw new Error('usePortalLayout must be used within PortalLayoutProvider');
  return ctx;
}
