// Current adapters normalize money to INR rupees. An explicit different unit
// is rejected, not stripped off and silently interpreted as the base currency.
export function financialUnitIssue(document, text = '') {
  const units = document.financialUnits;
  const currency = units?.canonicalCurrency ?? document.currency ?? document.baseCurrency;
  if (currency != null && currency !== 'INR') return 'This document is not normalized to INR; a verified currency-conversion adapter is required.';
  if (units?.canonicalMultiplier != null && units.canonicalMultiplier !== 1) return 'Money must be normalized to rupees before publication; lakh/crore scale cannot cross the canonical boundary.';
  if (units?.sourceCurrency && units.sourceCurrency !== 'INR') return 'A foreign-currency source needs a separately verified conversion and valuation-date policy.';
  // Only explicit report-unit declarations count. A company name or a prose
  // reference to an overseas investment is not a declaration of units.
  if (/^\s*(?:(?:all|financial)\s+)?(?:amounts?|figures?|values?)\s+(?:are\s+)?(?:expressed\s+)?in\s+(?:USD|EUR|GBP|US\s*dollars?|euros?|pounds?)\b/im.test(text)
    || /\bcurrency\s*[:=]\s*(?:USD|EUR|GBP)\b/i.test(text)) return 'The report explicitly declares a foreign currency unsupported by this INR adapter.';
  return null;
}
