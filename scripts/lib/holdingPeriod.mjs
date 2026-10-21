// MOVED to shared/holdingPeriod.mjs (Stage 10fz), so `build-book` and the
// browser (`src/lib/ltDate.ts`) share ONE copy of the s.2(42A) rule. Kept as a
// re-export so the build and its suite import it where they always have.
export * from "../../shared/holdingPeriod.mjs";
