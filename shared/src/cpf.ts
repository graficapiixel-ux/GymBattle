/** CPF: só os 11 dígitos. */
export const cpfDigits = (v: string) => v.replace(/\D/g, '');

/** Confere os dígitos verificadores do CPF (e recusa 000.000.000-00, 111… etc.). */
export function isValidCpf(v: string): boolean {
  const d = cpfDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split('').map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== n[len]) return false;
  }
  return true;
}

/** Máscara 000.000.000-00 enquanto digita. */
export function formatCpf(v: string): string {
  const d = cpfDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
