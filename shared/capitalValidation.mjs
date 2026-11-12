import { decimalMinor } from './financialArithmetic.mjs';
export function capitalIssues(values, terms = {}) {
  const issues = [], known = key => typeof values[key] === 'number' && Number.isFinite(values[key]);
  const amount = key => decimalMinor(values[key]);
  const excess = decimalMinor(terms.nonCalledPaidIn ?? 0);
  const add = (code, fields, message) => issues.push({ code, fields, message });
  const outside = value => value > 1n || value < -1n;
  for (const key of ['committed', 'called', 'paid', 'undrawn', 'pending']) {
    if (values[key] != null && (!known(key) || values[key] < 0))
      add('INVALID_CAPITAL_AMOUNT', [key], 'Capital balances must be finite non-negative amounts. Keep unsupported amounts missing until the source is corrected.');
  }
  if (known('committed') && known('called') && amount('called') > amount('committed') + 1n)
    add('CALLED_EXCEEDS_COMMITMENT', ['called', 'committed'], 'Called capital exceeds the commitment. Record any revised commitment before saving.');
  if (known('called') && known('paid') && amount('paid') - excess > amount('called') + 1n)
    add('PAID_EXCEEDS_CALLED', ['paid', 'called'], 'Paid-in capital exceeds called capital and the documented reinvestment adjustment.');
  if (known('committed') && known('paid') && amount('paid') - excess > amount('committed') + 1n)
    add('PAID_EXCEEDS_COMMITMENT', ['paid', 'committed'], 'Paid-in capital exceeds the commitment and the documented reinvestment adjustment.');
  if (known('committed') && known('called') && known('undrawn') && outside(amount('committed') - amount('called') - amount('undrawn')))
    add('UNDRAWN_DOES_NOT_RECONCILE', ['committed', 'called', 'undrawn'], 'Committed capital must equal called capital plus still-to-call capital.');
  if (known('called') && known('paid') && known('pending') && outside(amount('called') - amount('paid') + excess - amount('pending')))
    add('PENDING_DOES_NOT_RECONCILE', ['called', 'paid', 'pending'], 'Called capital must reconcile to paid-in capital, documented reinvestment and called-but-unpaid capital.');
  if (known('called') && known('pending') && amount('pending') > amount('called') + 1n)
    add('PENDING_EXCEEDS_CALLED', ['pending', 'called'], 'Called-but-unpaid capital exceeds total called capital.');
  return issues;
}
