import { useState, useEffect } from 'react';
import { adaptCatalogToTrails } from '../viewer/catalog/adapter';
import type { Trail } from '../viewer/catalog/types';
import type { BackendCatalogPayload } from '../viewer/catalog/adapter';
import { getAuthTokenFromStorage } from '../viewer/auth-storage';

const API_BASE = 'https://api.devoltecomele.com';

/**
 * Hook that fetches Trail[] exclusively from the backend API.
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
        const token = getAuthTokenFromStorage();
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/v1/catalog`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: BackendCatalogPayload = await res.json();
        if (!cancelled) {
          setTrails(adaptCatalogToTrails(data));
          setError(null);
        }
      } catch (err: any) {
        console.error('[useLessons] Failed to fetch catalog from backend:', err);
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
