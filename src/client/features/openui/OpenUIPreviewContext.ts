import { createContext, type ReactNode } from 'react';
import type { OpenUIProgram } from '../../../shared/openui';
/** History previews share the workspace renderer, with write tools disabled. */
export const OpenUIPreviewContext = createContext<
  ((program: OpenUIProgram) => ReactNode) | undefined
>(undefined);
