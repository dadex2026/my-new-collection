export const SIGNALS = {
  WALLET: "wallet",
  UI: "ui",
  REGISTRY: "registry",
  STATUS: "status",
  MINTING: "minting",
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
};