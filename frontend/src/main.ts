import { loadRegistry } from "./registry/adapter";
import { initUIEngine } from "./ui.engine";
import { connectWallet, disconnectWallet, autoReconnect } from "./wallet";
import { mint } from "./mint";

// ------------------------------------------------------------
// BUTTON BINDING
// ------------------------------------------------------------

function bindButtons() {
  document.addEventListener("click", async (e) => {
    const target = (e.target as HTMLElement).closest("[data-action]");
    if (!target) return;

    const action = (target as HTMLElement).dataset.action;
    const dropId = (target as HTMLElement).dataset.dropId;

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
    }
  });
}

// ------------------------------------------------------------
// BOOTSTRAP
// ------------------------------------------------------------

async function bootstrap() {
  console.log("🚀 BOOT");

  initUIEngine();
  bindButtons();

  await autoReconnect();
  await loadRegistry();

  console.log("✅ READY");
}

window.addEventListener("load", bootstrap);