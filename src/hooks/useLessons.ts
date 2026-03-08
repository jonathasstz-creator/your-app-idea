import { useMemo } from 'react';
import { buildLocalCatalog } from '../viewer/catalog/local-catalog';
import { adaptCatalogToTrails } from '../viewer/catalog/adapter';
import type { Trail } from '../viewer/catalog/types';

/**
 * Hook that returns the full Trail[] hierarchy derived from assets/lessons.json
 * via the catalog adapter pipeline (same shape the backend would produce).
 */
export function useLessons() {
  const trails = useMemo<Trail[]>(() => {
    const catalog = buildLocalCatalog();
    return adaptCatalogToTrails(catalog);
  }, []);

  return { trails, loading: false };
}
