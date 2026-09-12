// The persistent lifestyle catalog, read from and written to Supabase Auth
// user metadata (`lifestyle_catalog`) — see lib/tasks/lifestyle-catalog.ts
// for the why. Local state answers instantly (optimistic); the metadata
// write races behind it. A failed write (offline) is fine: anything still
// carried by a task gets re-adopted by the form's reconcile effect the
// next time it opens online.
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { parseCatalog, type CatalogLifestyle } from '@/lib/tasks/lifestyle-catalog';

export function useLifestyleCatalog(): {
  catalog: CatalogLifestyle[];
  updateCatalog: (mutate: (current: CatalogLifestyle[]) => CatalogLifestyle[]) => void;
} {
  const { session } = useAuth();
  const fromMetadata = parseCatalog(session?.user.user_metadata?.lifestyle_catalog);
  // Local overlay: set the moment the user creates/edits/deletes, so the UI
  // never waits on the auth round-trip (and never flickers back while the
  // session object still holds the old metadata).
  const [local, setLocal] = useState<CatalogLifestyle[] | null>(null);
  const catalog = local ?? fromMetadata;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const updateCatalog = useCallback(
    (mutate: (current: CatalogLifestyle[]) => CatalogLifestyle[]) => {
      const next = mutate(catalogRef.current);
      setLocal(next);
      // Fire-and-forget: catalog writes are never worth blocking the form
      // over, and the reconcile pass self-heals anything a dropped write
      // loses while its tasks still exist.
      void supabase.auth.updateUser({ data: { lifestyle_catalog: next } });
    },
    []
  );

  return { catalog, updateCatalog };
}
