import { loadRegistry, loadCampaigns } from "./registry/adapter";
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
  await loadRegistry();
  await loadCampaigns();
  console.log("? READY");
}
window.addEventListener("load", bootstrap);
