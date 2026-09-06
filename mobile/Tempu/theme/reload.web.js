// Web counterpart of reload.js (Metro picks this file for platform === 'web').
// expo-updates and DevSettings are both native-only; in a browser a plain
// document reload is exactly the same thing — the bundle re-evaluates and
// styles re-bake with the newly chosen theme.
export function reloadApp() {
  window.location.reload();
}
