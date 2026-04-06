import { useState, useEffect } from 'react';
import { adaptCatalogToTrails } from '../viewer/catalog/adapter';
import type { Trail } from '../viewer/catalog/types';
import type { BackendCatalogPayload } from '../viewer/catalog/adapter';
import { proxyFetchJson } from '../viewer/proxy-fetch';

/**
 * Hook that fetches Trail[] exclusively from the backend API via edge function proxy.
 * No local fallback — if the API fails, trails will be empty.
 */
export function useLessons() {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCatalog() {
      try {
        const catalog = await proxyFetchJson<BackendCatalogPayload>('/v1/catalog');

        if (!cancelled) {
          setTrails(adaptCatalogToTrails(catalog));
          setError(null);
        }
      } catch (err: any) {
        console.error('[useLessons] Failed to fetch catalog:', err);
        if (!cancelled) {
          setTrails([]);
          setError(err.message ?? 'Erro ao carregar catálogo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCatalog();
    return () => { cancelled = true; };
  }, []);

  return { trails, loading, error };
}
