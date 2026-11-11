// Decimal amounts cross the ledger boundary as scaled integers. BigInt is
// serialized as a string; binary floating-point remains appropriate for rates.
export function decimalMinor(value, decimals = 2) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw Error('Invalid decimal scale');
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Non-finite financial amount');
  if (!['string', 'number'].includes(typeof value)) throw Error('Missing financial amount');
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!match) throw Error('Invalid decimal amount');
  const exponent = Number(match[4] ?? 0), fraction = match[3] ?? '';
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw Error('Decimal exponent is out of range');
  const digits = BigInt(match[2] + fraction), shift = exponent - fraction.length + decimals;
  let scaled;
  if (shift >= 0) scaled = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    scaled = digits / divisor + (digits % divisor * 2n >= divisor ? 1n : 0n);
  }
  return match[1] === '-' ? -scaled : scaled;
}
export function moneyFromMinor(value) {
  const minor = BigInt(value);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Amount exceeds exact ledger range');
  return Number(minor) / 100;
}
export const roundMoney = value => moneyFromMinor(decimalMinor(value));
export function sumMoney(values) { return moneyFromMinor(values.reduce((sum, value) => sum + decimalMinor(value), 0n)); }
export function moneyEqual(left, right, toleranceMinor = 1n) {
  const delta = decimalMinor(left) - decimalMinor(right);
  return (delta < 0n ? -delta : delta) <= BigInt(toleranceMinor);
}
