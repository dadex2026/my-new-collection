import { state, subscribe } from "./state";
import { clearNodes } from "./domDiff";
import { batch } from "./batch";
import { RegistryDrop } from "./types";

let activeCollectionSlug = "all";
let activeFilters: Record<string, string> = {};
const FILTER_TRAITS = ["Category", "Market", "Tier", "Element", "Series"];

let lastStatus = "";
function renderStatus() {
  const value = state.ui.status;
  if (value === lastStatus) return;
  lastStatus = value;
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = value;
}

function renderMintButtons() {
  const btns = document.querySelectorAll<HTMLButtonElement>(".drop-mint-btn");
  btns.forEach((btn) => {
    btn.disabled = !state.wallet.connected || state.ui.minting;
    btn.textContent = state.ui.minting ? "Minting..." : "Mint";
  });
}

let lastWallet = "";
function renderWallet() {
  const el = document.getElementById("wallet");
  if (!el) return;
  const value = state.wallet.connected
    ? `Connected: ${state.wallet.address}`
    : "Disconnected";
  if (value === lastWallet) return;
  lastWallet = value;
  el.textContent = value;
}

function getTraitValue(drop: RegistryDrop, traitType: string): string | null {
  const attr = drop.attributes.find(
    (a) => a.trait_type.toLowerCase() === traitType.toLowerCase()
  );
  return attr ? attr.value : null;
}

function dropMatchesFilters(drop: RegistryDrop): boolean {
  for (const [traitType, value] of Object.entries(activeFilters)) {
    if (!value) continue;
    const dropValue = getTraitValue(drop, traitType);
    if (dropValue !== value) return false;
  }
  return true;
}

function getUniqueTraitValues(drops: RegistryDrop[], traitType: string): string[] {
  const values = new Set<string>();
  for (const drop of drops) {
    const val = getTraitValue(drop, traitType);
    if (val) values.add(val);
  }
  return Array.from(values).sort();
}

function getAllDrops(): RegistryDrop[] {
  return state.registry.flatMap((c) => c.drops);
}

function getActiveDrops(): RegistryDrop[] {
  if (activeCollectionSlug === "all") return getAllDrops();
  const col = state.registry.find((c) => c.collection.slug === activeCollectionSlug);
  return col?.drops ?? [];
}

function buildDropCard(d: RegistryDrop): string {
  const walletConnected = state.wallet.connected;
  return `
    <div class="drop" id="drop-${d.key}">
      ${d.itemImage ? `<img src="${d.itemImage}" alt="${d.itemName}" />` : ""}
      <div class="drop-name">${d.itemName}</div>
      ${d.itemDescription ? `<div class="drop-desc">${d.itemDescription}</div>` : ""}
      ${d.attributes.length > 0 ? `
        <div class="drop-attrs-label">Traits</div>
        <div class="drop-attrs">
          ${d.attributes.map((a) => `
            <span class="drop-attr">${a.trait_type}: ${a.value}</span>
          `).join("")}
        </div>
      ` : ""}
      <div class="drop-price">${d.price} SOL</div>
      <div class="drop-minted">
        ${d.minted ?? 0} / ${d.maxSupply ?? "Unlimited"} minted
      </div>
      ${d.status ? `<div class="drop-status">${d.status}</div>` : ""}
      <button
        class="drop-mint-btn"
        data-action="mint"
        data-drop-id="${d.key}"
        ${!walletConnected ? "disabled" : ""}>
        Mint
      </button>
    </div>
  `;
}

function renderDropPanel() {
  const dropPanel = document.getElementById("drop-panel");
  if (!dropPanel) return;

  const allDrops = getActiveDrops();
  const filteredDrops = allDrops.filter(dropMatchesFilters);

  let dropGrid = document.getElementById("drop-grid");
  if (!dropGrid) {
    dropGrid = document.createElement("div");
    dropGrid.id = "drop-grid";
    dropGrid.className = "drops";
    dropPanel.appendChild(dropGrid);
  }

  if (filteredDrops.length === 0) {
    dropGrid.innerHTML = '<p class="empty">No drops match the selected filters.</p>';
    return;
  }
  dropGrid.innerHTML = filteredDrops.map(buildDropCard).join("");
}

function renderSidebar(sidebarEl: HTMLElement) {
  const collections = state.registry;
  const allDrops = getAllDrops();

  // Build filter groups — only traits with more than 1 unique value
  const activeGroups = FILTER_TRAITS.filter(
    (trait) => getUniqueTraitValues(allDrops, trait).length > 1
  );

  const hasActiveFilter = Object.values(activeFilters).some(Boolean);

  sidebarEl.innerHTML = `
    <div class="sidebar-title">Collections</div>
    <div
      class="sidebar-item ${activeCollectionSlug === "all" ? "active" : ""}"
      data-slug="all">
      All Collections
    </div>
    ${collections.map((col) => `
      <div
        class="sidebar-item ${col.collection.slug === activeCollectionSlug ? "active" : ""}"
        data-slug="${col.collection.slug}">
        ${col.collection.name}
      </div>
    `).join("")}

    ${activeGroups.length > 0 ? `
      <div class="sidebar-divider"></div>
      <div class="sidebar-title">Filters</div>
      ${activeGroups.map((trait) => {
        const values = getUniqueTraitValues(allDrops, trait);
        return `
          <div class="sidebar-filter-group">
            <div class="sidebar-filter-label">${trait}</div>
            ${values.map((val) => `
              <div
                class="sidebar-filter-item ${activeFilters[trait] === val ? "active" : ""}"
                data-filter-trait="${trait}"
                data-filter-value="${val}">
                ${val}
              </div>
            `).join("")}
          </div>
        `;
      }).join("")}
      ${hasActiveFilter ? `
        <div class="sidebar-clear" data-action="clear-filters">
          Clear filters
        </div>
      ` : ""}
    ` : ""}
  `;

  // Bind collection items
  sidebarEl.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => {
      const slug = (item as HTMLElement).dataset.slug;
      if (!slug) return;
      activeCollectionSlug = slug;
      activeFilters = {};
      const dropPanel = document.getElementById("drop-panel");
      if (dropPanel) dropPanel.innerHTML = "";
      renderSidebar(sidebarEl);
      renderDropPanel();
    });
  });

  // Bind filter items
  sidebarEl.querySelectorAll(".sidebar-filter-item").forEach((item) => {
    item.addEventListener("click", () => {
      const trait = (item as HTMLElement).dataset.filterTrait!;
      const value = (item as HTMLElement).dataset.filterValue!;
      if (activeFilters[trait] === value) {
        delete activeFilters[trait];
      } else {
        activeFilters[trait] = value;
      }
      renderSidebar(sidebarEl);
      renderDropPanel();
    });
  });

  // Bind clear
  const clearBtn = sidebarEl.querySelector("[data-action='clear-filters']");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activeFilters = {};
      renderSidebar(sidebarEl);
      renderDropPanel();
    });
  }
}

function renderRegistry() {
  const root = document.getElementById("registry");
  if (!root) return;
  const collections = state.registry || [];

  clearNodes();

  // FIX: previously this was `if (collections.length === 0) return;` with
  // no clearNodes()/root.innerHTML update at all — meaning a legitimately
  // empty registry (e.g. a freshly reset template) left whatever static
  // placeholder text was in index.html (like "Loading registry...")
  // untouched forever, with no indication anything actually finished
  // loading. Now it renders an explicit empty state instead.
  if (collections.length === 0) {
    root.innerHTML = '<p class="empty">No collections available yet. Check back soon.</p>';
    return;
  }

  root.innerHTML = "";

  const sidebar = document.createElement("div");
  sidebar.className = "sidebar";
  sidebar.id = "sidebar";

  const dropPanel = document.createElement("div");
  dropPanel.className = "drop-panel";
  dropPanel.id = "drop-panel";

  root.appendChild(sidebar);
  root.appendChild(dropPanel);

  renderSidebar(sidebar);
  renderDropPanel();
}

function renderMintCounter() {
  const el = document.getElementById("mint-counter");
  if (!el) return;
  const totalMinted = state.registry
    .flatMap((c) => c.drops)
    .reduce((acc, d) => acc + (d.minted || 0), 0);
  el.textContent = `Minted: ${totalMinted}`;
}

export function initUIEngine() {
  subscribe("status", renderStatus);
  subscribe("minting", renderMintButtons);
  subscribe("wallet", renderMintButtons);
  subscribe("wallet", renderWallet);
  subscribe("wallet", () => renderDropPanel());
  subscribe("registry", () => {
    batch(() => {
      renderRegistry();
      renderMintCounter();
    });
  });
  renderStatus();
  renderMintButtons();
  renderWallet();
  renderRegistry();
  renderMintCounter();
  requestAnimationFrame(() => {
    renderStatus();
    renderMintButtons();
    renderWallet();
    renderRegistry();
    renderMintCounter();
  });
}