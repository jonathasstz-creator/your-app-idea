import React, { createContext, useContext, useEffect, useState } from 'react';
import { featureFlags } from './store';
import { FeatureFlags } from './types';

const FeatureFlagContext = createContext<FeatureFlags>(featureFlags.snapshot());

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlags.snapshot());

  useEffect(() => {
    const unsubscribe = featureFlags.subscribe((next) => setFlags(next));
    return () => unsubscribe();
  }, []);

  return <FeatureFlagContext.Provider value={flags}>{children}</FeatureFlagContext.Provider>;
};

export const useFeatureFlags = () => useContext(FeatureFlagContext);
