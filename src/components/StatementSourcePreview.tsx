import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buildLibrary, type ManifestEntry } from '@/lib/statementLibrary';
import { navEntry } from '@/lib/nav';
import { sourceBackground } from './SourceLink';
import { StatementPreview } from './StatementPreview';

/** The library's same viewer, above the still-mounted originating page. No
 * library upload/inbox side effects are needed just to inspect evidence. */
export default function StatementSourcePreview() {
  const [params] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const [manifest, setManifest] = useState<ManifestEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}audit/manifest.json`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(m => { if (alive) setManifest(m); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const matches = manifest?.filter(d => params.get('file') ? d.docKey === params.get('file') : !!params.get('path') && d.sourcePath === params.get('path')) ?? [];
  const doc = matches.length === 1 ? buildLibrary(matches).folders.flatMap(f => f.docs)[0] : undefined;
  const background = sourceBackground(location);
  const backLabel = `Back to ${navEntry(background?.pathname ?? '')?.label ?? 'previous view'}`;
  if (doc) return <StatementPreview doc={doc} onClose={() => navigate(-1)} backLabel={backLabel} />;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/70 p-6">
    <div role="dialog" aria-modal="true" aria-label="Statement source" className="rounded-lg border border-ink-700 bg-ink-900 p-6">
      <div role={failed || manifest ? 'alert' : 'status'}>{failed || manifest ? 'This exact source statement could not be opened.' : 'Opening source statement…'}</div>
      <button type="button" onClick={() => navigate(-1)} className="btn-ghost mt-3">{backLabel}</button>
    </div>
  </div>;
}
