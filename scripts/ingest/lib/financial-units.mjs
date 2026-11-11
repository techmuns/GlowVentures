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
  const scaled = /^\s*(?:(?:(?:all|financial)\s+)?(?:amounts?|figures?|values?)\s*\(?\s*(?:are\s+)?(?:expressed\s+)?in\s+|(?:INR|Rs\.?|₹|Rupees?)\s*\(?\s*in\s+)(?:(?:INR|Rs\.?|₹|Rupees?)\s*)?\(?\s*(?:lakhs?|lacs?|crores?|crs?|millions?|billions?|thousands?)\b/im;
  const scaleHeader = /^\s*(?:(?:(?:all|financial)\s+)?(?:amounts?|figures?|values?)\s*\(\s*|(?:currency\s*[:=]\s*)?)(?:INR|Rs\.?|₹|Rupees?)\s*(?:in\s+)?\(?\s*(?:lakhs?|lacs?|crores?|crs?|millions?|billions?|thousands?)\b/im;
  if (scaled.test(text) || scaleHeader.test(text)) return 'The report explicitly declares scaled money; a verified scale-conversion adapter is required before publication.';
  const declarations = [...text.matchAll(/(?:^\s*(?:(?:all|financial)\s+)?(?:amounts?|figures?|values?)\s+(?:are\s+)?(?:expressed\s+)?in\s+|\bcurrency\s*[:=]\s*)([a-z]{3})\b/gim)];
  if (declarations.some(m => m[1].toUpperCase() !== 'INR')
    || /^\s*(?:(?:all|financial)\s+)?(?:amounts?|figures?|values?)\s+(?:are\s+)?(?:expressed\s+)?in\s+(?:US\s*dollars?|euros?|pounds?)\b/im.test(text)) return 'The report explicitly declares a foreign currency unsupported by this INR adapter.';
  return null;
}
