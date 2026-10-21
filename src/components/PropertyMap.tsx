import { lazy, Suspense, useEffect, useState } from "react";
import { propertyMapConfig, type PropertyMapProps } from "@/lib/propertyMaps";
const GoogleMap = lazy(() => import("./PropertyGoogleMap"));
const LeafletMap = lazy(() => import("./PropertyLeafletMap"));
export default function PropertyMap(props: PropertyMapProps) {
  const [google, setGoogle] = useState<boolean>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    propertyMapConfig().then(config => { if (active) setGoogle(config.enabled); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div role="status" className="p-5 text-sm text-slate-400">{error} <button type="button" className="underline" onClick={() => { setError(""); setAttempt(a => a + 1); }}>Retry map</button></div>;
  const waiting = <div className="property-map grid place-items-center text-sm text-slate-400">Loading map…</div>;
  return <Suspense fallback={waiting}>{google === undefined ? waiting : google ? <GoogleMap {...props} /> : <LeafletMap {...props} />}</Suspense>;
}
