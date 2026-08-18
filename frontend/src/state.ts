import { AppState, SIGNALS, SignalName } from "./types";
export const state: AppState = {
  wallet: {
    connected: false,
    address: null,
  },
  ui: {
    status: "",
    minting: false,
  },
  registry: [],
  campaigns: [],
};
// ----------------------------
// SIGNAL SYSTEM
// ----------------------------
type Listener = () => void;
const listeners: Record<SignalName, Set<Listener>> = {
  wallet: new Set(),
  ui: new Set(),
  registry: new Set(),
  status: new Set(),
  minting: new Set(),
  campaigns: new Set(),
};
export function subscribe(signal: SignalName, fn: Listener) {
  listeners[signal].add(fn);
  return () => listeners[signal].delete(fn);
}
function notify(signal: SignalName) {
  listeners[signal].forEach((fn) => fn());
}
// ----------------------------
// WALLET
// ----------------------------
export function setWallet(address: string | null) {
  state.wallet.address = address;
  state.wallet.connected = !!address;
  notify(SIGNALS.WALLET);
}
// ----------------------------
// UI STATUS
// ----------------------------
export function setStatus(status: string) {
  state.ui.status = status;
  notify(SIGNALS.STATUS);
}
// ----------------------------
// MINTING
// ----------------------------
export function setMinting(v: boolean) {
  state.ui.minting = v;
  notify(SIGNALS.MINTING);
}
// ----------------------------
// REGISTRY
// ----------------------------
export function setRegistry(registry: AppState["registry"]) {
  state.registry = registry;
  notify(SIGNALS.REGISTRY);
}
// ----------------------------
// CAMPAIGNS
// ----------------------------
export function setCampaigns(campaigns: AppState["campaigns"]) {
  state.campaigns = campaigns;
  notify(SIGNALS.CAMPAIGNS);
}
