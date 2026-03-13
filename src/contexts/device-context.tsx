"use client";

import { createContext, useContext, ReactNode } from "react";

type DeviceContextType = {
  isMobile: boolean;
};

const DeviceContext = createContext<DeviceContextType>({
  isMobile: false,
});

export function DeviceProvider({
  children,
  isMobile,
}: {
  children: ReactNode;
  isMobile: boolean;
}) {
  return (
    <DeviceContext.Provider value={{ isMobile }}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
