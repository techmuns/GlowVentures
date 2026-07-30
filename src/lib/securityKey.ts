// The book's join key, for the browser app.
//
// The implementation lives in `shared/securityKey.mjs` so the Node ingest
// pipeline and this app derive keys with the SAME code — the extractor keys the
// rows it pulls out of a statement and the app joins on those keys, so any
// drift between two copies would split one holding into two positions that
// never reconcile. See the long note there.
export {
  normalizeSecurityName,
  securityKeyOf,
} from "../../shared/securityKey.mjs";
