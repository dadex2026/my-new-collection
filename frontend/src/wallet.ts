import { setWallet, setStatus } from "./state";

// ------------------------------------------------------------
// PHANTOM PROVIDER
// ------------------------------------------------------------

function getProvider(): any {
  const provider = (window as any).solana;

  if (!provider?.isPhantom) {
    throw new Error("Phantom wallet not found");
  }

  return provider;
}

// ------------------------------------------------------------
// CONNECT WALLET
// ------------------------------------------------------------

export async function connectWallet(): Promise<string | null> {
  try {
    const provider = getProvider();

    const response = await provider.connect();

    const address = response.publicKey.toString();

    setWallet(address);
    setStatus("Wallet connected");

    return address;
  } catch (err: any) {
    console.error("[WALLET CONNECT ERROR]", err);
    setStatus("Wallet connection failed");
    return null;
  }
}

// ------------------------------------------------------------
// DISCONNECT WALLET
// ------------------------------------------------------------

export async function disconnectWallet(): Promise<void> {
  try {
    const provider = getProvider();
    await provider.disconnect();
  } catch (err: any) {
    console.error("[WALLET DISCONNECT ERROR]", err);
  } finally {
    setWallet(null);
    setStatus("Wallet disconnected");
  }
}

// ------------------------------------------------------------
// AUTO RECONNECT
// ------------------------------------------------------------

export async function autoReconnect(): Promise<void> {
  try {
    const provider = getProvider();

    if (!provider.isConnected) {
      await provider.connect({ onlyIfTrusted: true });
    }

    if (provider.isConnected && provider.publicKey) {
      setWallet(provider.publicKey.toString());
      setStatus("Wallet auto-reconnected");
    }
  } catch {
    // Silent failure expected when no trusted session exists
  }
}