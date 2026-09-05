import { loadRegistry, loadCampaigns, loadTextCards, loadMethodology, refreshMintedCounts } from "./registry/adapter";
import { initUIEngine } from "./ui.engine";
import { connectWallet, disconnectWallet, autoReconnect } from "./wallet";
import { mint } from "./mint";
import { claimCampaign } from "./campaign";

// ------------------------------------------------------------
// BUTTON BINDING
// ------------------------------------------------------------
function bindButtons() {
  document.addEventListener("click", async (e) => {
    const target = (e.target as HTMLElement).closest("[data-action]");
    if (!target) return;
    const action = (target as HTMLElement).dataset.action;
    const dropId = (target as HTMLElement).dataset.dropId;
    const campaignId = (target as HTMLElement).dataset.campaignId;

    switch (action) {
      case "connect-wallet":
        await connectWallet();
        break;
      case "disconnect-wallet":
        await disconnectWallet();
        break;
      case "mint":
        if (dropId) await mint(dropId);
        break;
      case "claim-campaign":
        if (campaignId) await claimCampaign(campaignId);
        break;
    }
  });
}

// ------------------------------------------------------------
// BOOTSTRAP
// ------------------------------------------------------------
async function bootstrap() {
  console.log("?? BOOT");
  initUIEngine();
  bindButtons();
  await autoReconnect();
  const registry = await loadRegistry();
  await loadCampaigns();
  await loadTextCards();
  await loadMethodology();
  console.log("? READY");

  // refreshMintedCounts has existed, exported, since it was written, and was
  // never called once - which is the actual reason every card showed a frozen
  // mint count (open-items 40). That item guessed the browser RPC block (item
  // 36) was to blame and said to re-check once the proxy was fixed; the proxy
  // is fixed and the count still would not have moved, because nothing asked
  // it to.
  //
  // Deliberately after the awaits and deliberately NOT awaited: it costs one
  // RPC call per deployed drop, and a slow or dead RPC must not delay a page
  // the reader can already use. It fails silently by design and leaves the
  // registry.json snapshot in place.
  if (registry) void refreshMintedCounts(registry);
}

window.addEventListener("load", bootstrap);
