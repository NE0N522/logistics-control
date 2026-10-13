let exchangeRateKgsPerUsd = 87.45;

export function setExchangeRateKgsPerUsd(value) {
  const rate = Number(value);
  if (Number.isFinite(rate) && rate > 0) exchangeRateKgsPerUsd = rate;
}

export function getExchangeRateKgsPerUsd() {
  return exchangeRateKgsPerUsd;
}

export function kgsToUsd(value) {
  return (Number(value) || 0) / exchangeRateKgsPerUsd;
}

export function usdToKgs(value) {
  return Math.round((Number(value) || 0) * exchangeRateKgsPerUsd * 100) / 100;
}

export function kgsToUsdInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const amount = kgsToUsd(value);
  return Number.isFinite(amount) ? String(Number(amount.toFixed(2))) : '';
}
