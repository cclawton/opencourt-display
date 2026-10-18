import type { ComponentType } from 'react';
import type { RuntimeConfig } from './runtime-config';

export type ClubExtensionProps = {
  config: RuntimeConfig;
  token: string;
  onDirtyChange?: (dirty: boolean) => void;
};
export type ClubExtension = {
  id: string;
  label: string;
  Component: ComponentType<ClubExtensionProps>;
};

// Public builds have no club editors. Private builds supply this same contract.
export const clubExtensions: ClubExtension[] = [];
