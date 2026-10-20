// Browser privacy settings can disable storage; preferences must not prevent a siege.
export function readStored(storage, key) {
  try { return window[storage].getItem(key); } catch { return null; }
}
export function writeStored(storage, key, value) {
  try { window[storage].setItem(key, value); } catch { /* Play without persistence. */ }
}
