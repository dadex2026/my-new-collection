export const SIGNALS = {
  WALLET: "wallet",
  UI: "ui",
  REGISTRY: "registry",
  STATUS: "status",
  MINTING: "minting",
  CAMPAIGNS: "campaigns",
  TEXTCARDS: "textCards",
  METHODOLOGY: "methodology",
} as const;

export type SignalName = typeof SIGNALS[keyof typeof SIGNALS];

// ----------------------------
// REGISTRY TYPES
// ----------------------------
export type RegistryAttribute = {
  trait_type: string;
  value: string;
};

export type RegistryDrop = {
  key: string;
  dropItemId: string;
  itemName: string;
  itemDescription: string;
  itemImage: string;
  itemExternalUrl: string;
  price: number;
  minted?: number;
  maxSupply: number | null;
  status: string;
  sellerFeeBasisPoints: number;
  attributes: RegistryAttribute[];
  uri: string;
  collectionAddress: string;
  // Empty for a drop with no candy machine of its own - a voucher, or an
  // edition not deployed yet. The card decides what its button does on this.
  candyMachineAddress?: string;
  // Set only for drops whose candy machine carries a `holder` guard group.
  // Presence is what says a voucher route exists; holderPrice of 0 or null
  // means redeeming is free, matching a holder group with no solPayment.
  holderRequiredCollection?: string;
  holderPrice?: number | null;
};

export type RegistryCollection = {
  slug: string;
  name: string;
  description: string;
  image: string;
  externalUrl: string;
  address: string;
};

export type CollectionWithDrops = {
  collection: RegistryCollection;
  drops: RegistryDrop[];
};

// ----------------------------
// CAMPAIGN TYPES
// ----------------------------
export type Campaign = {
  campaignId: string;
  title: string;
  headline: string;
  description: string;
  eligibilityText: string;
  rewardText: string;
  priceText: string;
  allocationText: string;
  claimText: string;
  soldOutText: string;
  eligibilityCollection: string;
  targetDropItemId: string;
  targetCollection: string;
  targetImage: string;
  campaignCandyMachineAddress: string;
  price: number;
  allocation: number;
  network: string;
  treasury: string;
  claimed: number | null;
  claimLimitId?: string;
  /** The assetMintLimit id. Empty on pre-2026-09-03 campaigns, which used 1. */
  assetLimitId?: string;
  /** "wallet" (mintLimit) or "asset" (assetMintLimit). Empty means asset. */
  claimScope?: string;
  claimLimit?: number | null;
};

// ----------------------------
// TEXT CARD TYPES
// ----------------------------
// Matches backend/content-registry.json, produced by
// backend/scripts/generate-content-registry.js from backend/textcards.csv
// (simple cards) plus any hand-edited persistent cards.
export type TextCardCategory =
  | "NEWS"
  | "UPDATE"
  | "ANNOUNCEMENT"
  | "ANALYSIS"
  | "RANKING"
  | "LEADERBOARD"
  | "SCOREBOARD"
  | "STANDINGS"
  | "STATS";

export type TextCardStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "INACTIVE"
  | "EXPIRED"
  | "ARCHIVED";

// Structured content for persistent cards: an ordered list of entries
// (e.g. rank/name/score rows), or a flat key/value object (e.g. a
// stats summary with no natural row structure). Deliberately generic —
// no per-category shape — so a new persistent category never requires
// a new render function, only a new `category` value in the CSV/JSON.
export type TextCardStructuredContent =
  | { entries: Array<Record<string, string | number>> }
  | Record<string, string | number>;

export type TextCard = {
  textCardId: string;
  category: TextCardCategory;
  persistent: boolean;
  headline: string;
  subheadline: string | null;
  content: string | TextCardStructuredContent;
  publishedDate: string;
  updatedDate: string;
  status: TextCardStatus;
  expiresAt: string | null;
  tags: string[];
  featured: boolean;
  priority: number;
  author: string | null;
  // `{}` on a card with no image, and on every generated persistent card.
  // Kept open beyond image/alt so a later media kind doesn't require a type
  // change in lockstep with the generator.
  media: { image?: string; alt?: string } & Record<string, unknown>;
  relationships: Record<string, unknown>;
};

// ----------------------------
// METHODOLOGY
// ----------------------------
// Matches frontend/public/methodology.json, produced by
// backend/scripts/generate-methodology.js. Authored prose lives in
// backend/methodology/methodology.json; everything that could go stale —
// which boards exist, which ruleset produced each, which exports they were
// built from — is derived at generate time rather than written by hand.
export type MethodologySection = {
  id: string;
  heading: string;
  body: string[];
};

export type MethodologyBoard = {
  boardId: string;
  title: string;
  track: string;
  entityType: string;
  seasonId: string;
  throughRound: string | null;
  rulesetVersion: string | null;
  rankedCount: number;
  omittedNoValue: number;
  omittedReason: string | null;
  movementShown: boolean;
  movementSuppressedReason: string | null;
};

export type MethodologyChangelogEntry = {
  id: string;
  kind: string;
  effectiveFrom: string | null;
  note: string;
};

export type MethodologyUnranked = {
  handle: string;
  predictions: number;
  countingPredictions: number;
  reason: string;
};

export type Methodology = {
  generatedAt: string;
  title: string;
  intro: string;
  collection: {
    title: string;
    seasonId: string;
    minPicks: number | null;
    cardLimit: number | null;
  };
  sections: MethodologySection[];
  boards: MethodologyBoard[];
  unranked: MethodologyUnranked[];
  changelog: MethodologyChangelogEntry[];
  kinds: Record<string, string>;
  sources: {
    roundExports: string[];
    evidenceExports: string[];
    captureMethod: string;
  };
};

// ----------------------------
// UI STATE
// ----------------------------
export type UIState = {
  status: string;
  minting: boolean;
};

// ----------------------------
// WALLET
// ----------------------------
export type WalletState = {
  connected: boolean;
  address: string | null;
};

// ----------------------------
// APP STATE
// ----------------------------
export type AppState = {
  wallet: WalletState;
  ui: UIState;
  registry: CollectionWithDrops[];
  campaigns: Campaign[];
  textCards: TextCard[];
  methodology: Methodology | null;
};
