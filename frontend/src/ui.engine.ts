import { state, subscribe } from "./state";
import { clearNodes } from "./domDiff";
import { batch } from "./batch";
import { RegistryDrop, Campaign, TextCard } from "./types";

let activeCollectionSlug = "all";
let activeFilters: Record<string, string> = {};
const FILTER_TRAITS = ["Category", "Market", "Tier", "Element", "Series"];

// ----------------------------
// PAGINATION (shared across Drops, Campaigns, Text Cards)
// ----------------------------
// Each of the three sections keeps its OWN page number — changing page on
// one section never touches the others. Deliberately three independent
// data sources (registry.json / campaigns.json / content-registry.json),
// each with its own pagination, rather than a single merged/paginated
// list — these are different systems with different lifecycles, not
// variations of one "campaign record" type.
const PAGE_SIZE = 6;
let dropsPage = 1;
let campaignsPage = 1;
let textCardsPage = 1;

function paginate<T>(items: T[], page: number): { pageItems: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  return { pageItems: items.slice(start, start + PAGE_SIZE), totalPages, page: clampedPage };
}

function buildPaginationControls(page: number, totalPages: number): string {
  if (totalPages <= 1) return "";
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return `
    <div class="pagination">
      <button class="pagination-arrow" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>&larr;</button>
      ${pages.map((p) => `
        <button class="pagination-num ${p === page ? "active" : ""}" data-page-num="${p}">${p}</button>
      `).join("")}
      <button class="pagination-arrow" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>&rarr;</button>
    </div>
  `;
}

// Binds click handlers for a single .pagination block that was just
// (re)rendered inside `container`. Rebinding on every render matches this
// codebase's existing full-innerHTML-replace-then-rebind pattern (see
// renderSidebar/renderTextCards) rather than a persistent listener.
function wirePagination(
  container: Element,
  getPage: () => number,
  setPage: (p: number) => void,
  totalPages: number,
  rerender: () => void
) {
  const pagination = container.querySelector(".pagination");
  if (!pagination) return;

  pagination.querySelectorAll<HTMLButtonElement>("[data-page-num]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.pageNum);
      if (!n) return;
      setPage(n);
      rerender();
    });
  });

  const prevBtn = pagination.querySelector<HTMLButtonElement>('[data-page-action="prev"]');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener("click", () => {
      setPage(Math.max(1, getPage() - 1));
      rerender();
    });
  }

  const nextBtn = pagination.querySelector<HTMLButtonElement>('[data-page-action="next"]');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener("click", () => {
      setPage(Math.min(totalPages, getPage() + 1));
      rerender();
    });
  }
}

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
  // Campaign claim buttons follow the same enable/disable rule as mint
  // buttons — need a connected wallet, and disabled mid-transaction.
  const claimBtns = document.querySelectorAll<HTMLButtonElement>(".campaign-claim-btn");
  claimBtns.forEach((btn) => {
    btn.disabled = !state.wallet.connected || state.ui.minting;
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

  let dropPagination = document.getElementById("drop-pagination");
  if (!dropPagination) {
    dropPagination = document.createElement("div");
    dropPagination.id = "drop-pagination";
    dropPanel.appendChild(dropPagination);
  }

  if (filteredDrops.length === 0) {
    dropGrid.innerHTML = '<p class="empty">No drops match the selected filters.</p>';
    dropPagination.innerHTML = "";
    return;
  }

  const { pageItems, totalPages, page } = paginate(filteredDrops, dropsPage);
  dropsPage = page;

  dropGrid.innerHTML = pageItems.map(buildDropCard).join("");
  dropPagination.innerHTML = buildPaginationControls(page, totalPages);
  wirePagination(
    dropPagination,
    () => dropsPage,
    (p) => { dropsPage = p; },
    totalPages,
    renderDropPanel
  );
}

function renderSidebar(sidebarEl: HTMLElement) {
  const collections = state.registry;
  const allDrops = getAllDrops();

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

    ${state.campaigns.length > 0 ? `
      <div class="sidebar-divider"></div>
      <div class="sidebar-title">Holder Rewards</div>
      <div class="sidebar-item sidebar-item-rewards" data-action="scroll-to-rewards">
        Rewards
      </div>
    ` : ""}

    ${state.textCards.length > 0 ? `
      <div class="sidebar-divider"></div>
      <div class="sidebar-title">Content</div>
      <div class="sidebar-item sidebar-item-textcards" data-action="scroll-to-textcards">
        News
      </div>
    ` : ""}

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

  sidebarEl.querySelectorAll(".sidebar-item[data-slug]").forEach((item) => {
    item.addEventListener("click", () => {
      const slug = (item as HTMLElement).dataset.slug;
      if (!slug) return;
      activeCollectionSlug = slug;
      activeFilters = {};
      dropsPage = 1;
      const dropGrid = document.getElementById("drop-grid");
      if (dropGrid) dropGrid.innerHTML = "";
      const select = document.getElementById("collection-select") as HTMLSelectElement | null;
      if (select) select.value = slug;
      renderSidebar(sidebarEl);
      renderDropPanel();
    });
  });

  const rewardsItem = sidebarEl.querySelector(".sidebar-item-rewards");
  if (rewardsItem) {
    rewardsItem.addEventListener("click", () => {
      document.getElementById("campaigns")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  const textCardsItem = sidebarEl.querySelector(".sidebar-item-textcards");
  if (textCardsItem) {
    textCardsItem.addEventListener("click", () => {
      document.getElementById("textcards")?.scrollIntoView({ behavior: "smooth" });
    });
  }

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

  const dropPanelHeader = document.createElement("div");
  dropPanelHeader.className = "drop-panel-header";
  dropPanelHeader.id = "drop-panel-header";
  dropPanel.appendChild(dropPanelHeader);

  root.appendChild(sidebar);
  root.appendChild(dropPanel);

  renderSidebar(sidebar);
  renderCollectionSelect(dropPanelHeader);
  renderDropPanel();
}

// Drops-only collection filter. Deliberately not applied to Campaigns or
// Text Cards — those are independent sections with their own data sources
// and are not scoped by collection the way Drops are via the sidebar.
function renderCollectionSelect(container: HTMLElement) {
  const collections = state.registry;
  if (collections.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="collection-filter">
      <label class="collection-filter-label" for="collection-select">Filter by collection</label>
      <select class="collection-select" id="collection-select">
        <option value="all" ${activeCollectionSlug === "all" ? "selected" : ""}>All Collections</option>
        ${collections.map((col) => `
          <option value="${col.collection.slug}" ${col.collection.slug === activeCollectionSlug ? "selected" : ""}>
            ${col.collection.name}
          </option>
        `).join("")}
      </select>
    </div>
  `;

  const select = container.querySelector<HTMLSelectElement>("#collection-select");
  if (select) {
    select.addEventListener("change", () => {
      activeCollectionSlug = select.value;
      activeFilters = {};
      dropsPage = 1;
      const sidebarEl = document.getElementById("sidebar");
      const dropPanel = document.getElementById("drop-panel");
      if (dropPanel) {
        const grid = document.getElementById("drop-grid");
        if (grid) grid.innerHTML = "";
      }
      if (sidebarEl) renderSidebar(sidebarEl);
      renderDropPanel();
    });
  }
}

function renderMintCounter() {
  const el = document.getElementById("mint-counter");
  if (!el) return;
  const totalMinted = state.registry
    .flatMap((c) => c.drops)
    .reduce((acc, d) => acc + (d.minted || 0), 0);
  el.textContent = `Minted: ${totalMinted}`;
}

// ----------------------------
// CAMPAIGNS
// ----------------------------
// Renders into the #campaigns container in index.html.
function buildCampaignCard(c: Campaign): string {
  const walletConnected = state.wallet.connected;
  const soldOut = c.claimed != null && c.claimed >= c.allocation;

  return `
    <div class="campaign" id="campaign-${c.campaignId}">
      ${c.targetImage ? `<img src="${c.targetImage}" alt="${c.title}" />` : ""}
      <div class="campaign-title">${c.title}</div>
      <div class="campaign-headline">${c.headline}</div>
      ${c.description ? `<div class="campaign-desc">${c.description}</div>` : ""}
      ${c.eligibilityText ? `<div class="campaign-eligibility">${c.eligibilityText}</div>` : ""}
      ${c.rewardText ? `<div class="campaign-reward">${c.rewardText}</div>` : ""}
      <div class="campaign-price">${c.priceText}</div>
      <div class="campaign-allocation">
        ${c.claimed ?? 0} / ${c.allocation} claimed
      </div>
      ${soldOut
        ? `<div class="campaign-sold-out">${c.soldOutText}</div>`
        : `<button
            class="campaign-claim-btn"
            data-action="claim-campaign"
            data-campaign-id="${c.campaignId}"
            ${!walletConnected ? "disabled" : ""}>
            ${c.claimText}
          </button>`
      }
    </div>
  `;
}

function renderCampaigns() {
  const root = document.getElementById("campaigns");
  if (!root) return;

  const campaigns = state.campaigns || [];

  if (campaigns.length === 0) {
    root.innerHTML = "";
    return;
  }

  const { pageItems, totalPages, page } = paginate(campaigns, campaignsPage);
  campaignsPage = page;

  root.innerHTML = `
    <div class="campaigns-title">Holder Campaigns</div>
    <div class="campaigns-grid">
      ${pageItems.map(buildCampaignCard).join("")}
    </div>
    ${buildPaginationControls(page, totalPages)}
  `;

  wirePagination(
    root,
    () => campaignsPage,
    (p) => { campaignsPage = p; },
    totalPages,
    renderCampaigns
  );
}

// ----------------------------
// TEXT CARDS (new)
// ----------------------------
// Renders into the #textcards container in index.html, below #campaigns.
// Source: backend/content-registry.json, published from backend/textcards.csv
// by backend/scripts/generate-content-registry.js (simple cards), plus any
// hand-edited persistent cards (category RANKING/LEADERBOARD/SCOREBOARD/
// STANDINGS/STATS, persistent: true) merged into the same file.
const TEXTCARD_TABS = ["ALL", "NEWS", "UPDATE", "ANNOUNCEMENT", "ANALYSIS", "RANKINGS"] as const;
let activeTextCardTab: (typeof TEXTCARD_TABS)[number] = "ALL";

function formatCardDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Persistent cards carry structured content (an entries array, or a flat
// key/value object) instead of prose. Rendered generically — by key, not
// by category — so a new persistent category never needs a new render path.
function renderTextCardContent(c: TextCard): string {
  if (typeof c.content === "string") {
    return `<div class="textcard-body">${c.content}</div>`;
  }

  const structured = c.content as { entries?: Array<Record<string, string | number>> };
  if (Array.isArray(structured.entries)) {
    return `
      <ol class="textcard-entries">
        ${structured.entries.map((entry) => `
          <li class="textcard-entry">
            ${Object.entries(entry).map(([k, v]) => `<span class="textcard-entry-field">${k}: ${v}</span>`).join(" ")}
          </li>
        `).join("")}
      </ol>
    `;
  }

  return `
    <div class="textcard-stats">
      ${Object.entries(c.content as Record<string, string | number>).map(([k, v]) => `
        <div class="textcard-stat"><span class="textcard-stat-label">${k}</span><span class="textcard-stat-value">${v}</span></div>
      `).join("")}
    </div>
  `;
}

function buildTextCard(c: TextCard): string {
  const showUpdated = c.updatedDate && c.updatedDate !== c.publishedDate;
  return `
    <div class="textcard" id="textcard-${c.textCardId}">
      <div class="textcard-category">${c.category}${c.persistent ? " · Persistent" : ""}</div>
      <div class="textcard-headline">${c.headline}</div>
      ${c.subheadline ? `<div class="textcard-subheadline">${c.subheadline}</div>` : ""}
      ${renderTextCardContent(c)}
      <div class="textcard-meta">
        <span class="textcard-date">${formatCardDate(c.publishedDate)}</span>
        ${showUpdated ? `<span class="textcard-updated">Updated ${formatCardDate(c.updatedDate)}</span>` : ""}
      </div>
    </div>
  `;
}

// Visibility rule: status ACTIVE, publishedDate has passed, and (no
// expiresAt or it hasn't passed yet). Never filters cards out of
// state.textCards itself — only out of what's rendered — so expired/draft
// cards stay in the data untouched, per the "never delete" design.
function isTextCardVisible(c: TextCard): boolean {
  if (c.status !== "ACTIVE") return false;
  const now = Date.now();
  if (Date.parse(c.publishedDate) > now) return false;
  if (c.expiresAt && Date.parse(c.expiresAt) <= now) return false;
  return true;
}

function textCardMatchesTab(c: TextCard): boolean {
  if (activeTextCardTab === "ALL") return true;
  if (activeTextCardTab === "RANKINGS") return c.persistent === true;
  return c.category === activeTextCardTab;
}

function getVisibleTextCards(): TextCard[] {
  return state.textCards
    .filter(isTextCardVisible)
    .filter(textCardMatchesTab)
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return Date.parse(b.publishedDate) - Date.parse(a.publishedDate);
    });
}

function renderTextCards() {
  const root = document.getElementById("textcards");
  if (!root) return;

  if (state.textCards.length === 0) {
    root.innerHTML = "";
    return;
  }

  const visibleCards = getVisibleTextCards();
  const { pageItems, totalPages, page } = paginate(visibleCards, textCardsPage);
  textCardsPage = page;

  root.innerHTML = `
    <div class="textcards-title">News</div>
    <div class="textcards-tabs">
      ${TEXTCARD_TABS.map((tab) => `
        <div
          class="textcards-tab ${activeTextCardTab === tab ? "active" : ""}"
          data-textcard-tab="${tab}">
          ${tab}
        </div>
      `).join("")}
    </div>
    ${visibleCards.length === 0
      ? '<p class="empty">No posts in this category yet.</p>'
      : `<div class="textcards-grid">${pageItems.map(buildTextCard).join("")}</div>
         ${buildPaginationControls(page, totalPages)}`
    }
  `;

  root.querySelectorAll("[data-textcard-tab]").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      const tab = (tabEl as HTMLElement).dataset.textcardTab as (typeof TEXTCARD_TABS)[number] | undefined;
      if (!tab) return;
      activeTextCardTab = tab;
      textCardsPage = 1;
      renderTextCards();
    });
  });

  if (visibleCards.length > 0) {
    wirePagination(
      root,
      () => textCardsPage,
      (p) => { textCardsPage = p; },
      totalPages,
      renderTextCards
    );
  }
}

export function initUIEngine() {
  subscribe("status", renderStatus);
  subscribe("minting", renderMintButtons);
  subscribe("wallet", renderMintButtons);
  subscribe("wallet", renderWallet);
  subscribe("wallet", () => renderDropPanel());
  subscribe("wallet", () => renderCampaigns());
  subscribe("registry", () => {
    batch(() => {
      renderRegistry();
      renderMintCounter();
    });
  });
  subscribe("campaigns", () => {
    renderCampaigns();
    // Campaigns load AFTER the initial registry render (see main.ts's
    // bootstrap order) — without re-rendering the sidebar here too,
    // the Rewards entry would never appear on first page load, since
    // the sidebar was already drawn before any campaign data existed.
    const sidebarEl = document.getElementById("sidebar");
    if (sidebarEl) renderSidebar(sidebarEl);
  });
  subscribe("textCards", () => {
    renderTextCards();
    // Same bootstrap-order issue as campaigns above: text cards load
    // after the initial registry render, so the sidebar's News entry
    // needs an explicit re-render here too, or it never appears.
    const sidebarEl = document.getElementById("sidebar");
    if (sidebarEl) renderSidebar(sidebarEl);
  });
  renderStatus();
  renderMintButtons();
  renderWallet();
  renderRegistry();
  renderMintCounter();
  renderCampaigns();
  renderTextCards();
  requestAnimationFrame(() => {
    renderStatus();
    renderMintButtons();
    renderWallet();
    renderRegistry();
    renderMintCounter();
    renderCampaigns();
    renderTextCards();
  });
}
