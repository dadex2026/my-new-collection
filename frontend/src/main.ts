import { loadRegistry, loadCampaigns, loadTextCards, refreshMintedCounts } from "./registry/adapter";
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
  console.log("? READY");

  // refreshMintedCounts was exported and never called, which is why every card
  // showed a frozen mint count (open-items 40). Not awaited: one RPC call per
  // deployed drop must not delay a page the reader can already use.
  if (registry) void refreshMintedCounts(registry);
}
window.addEventListener("load", bootstrap);
