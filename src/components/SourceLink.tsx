import { useTableExporting } from '@/lib/tableExportSnapshot';
import { Link, useLocation, type LinkProps, type Location } from 'react-router-dom';

/** Keep the originating route mounted, including its local table state and
 * scroll containers. Browser Back, Escape and the preview's Back all pop the
 * same history entry. A copied source URL remains an ordinary library link. */
export function sourceBackground(location: Location): Location | undefined {
  const candidate = location.state?.sourceBackground as Location | undefined;
  if (location.pathname !== '/statements' || !candidate || candidate.pathname === '/statements'
    || !candidate.pathname?.startsWith('/') || candidate.pathname.startsWith('//')
    || typeof candidate.search !== 'string' || typeof candidate.key !== 'string') return undefined;
  return candidate;
}

export function SourceLink({ to, state, ...props }: LinkProps) {
  const location = useLocation();
  const exporting = useTableExporting();
  const source = !exporting && typeof to === 'string' && to.startsWith('/statements?') && location.pathname !== '/statements';
  // Full-family workbook snapshots keep their links unfiltered as well as
  // their figures. Interactive navigation alone carries the member scope.
  // Preserve member scope without the provider's URL-normalising effect
  // replacing this history entry and discarding the background location.
  const members = new URLSearchParams(location.search).get('members');
  if (source && members !== null) {
    const [pathname, search] = (to as string).split('?');
    const params = new URLSearchParams(search); params.set('members', members);
    to = `${pathname}?${params}`;
  }
  return <Link {...props} to={to} state={source ? { ...state, sourceBackground: location } : state} />;
}

SourceLink.sourceTraceControl = true;
