import { D1Item } from 'app/inventory-stores/item-types';
import { DimStore } from 'app/inventory-stores/store-types';
import { findItemsByBucket } from 'app/inventory-stores/stores-helpers';

// In D1 there were exotic ghosts that you could only equip if you also had a "Faction Badge" equipped
// that matched that faction. These functions help identify what faction badge is equipped on the character
// and what badge a particular item requires.

// Maps inventory item hash to faction
const factionBadges = {
  969832704: 'Future War Cult',
  27411484: 'Dead Orbit',
  2954371221: 'New Monarchy',
};

// Maps talent grid node to faction
const factionNodes = {
  2669659850: 'Future War Cult',
  2794386410: 'Dead Orbit',
  652505621: 'New Monarchy',
};

// Maps faction definition hash to faction name
const factionsByHash = {
  489342053: 'Future War Cult',
  2397602219: 'Dead Orbit',
  3197190122: 'New Monarchy',
};

/** What faction is this character aligned with (by equipping that faction's badge)? */
export function factionAlignment(store: DimStore): string | null {
  const badge = findItemsByBucket(store, 375726501).find((i) => factionBadges[i.hash]);
  if (!badge) {
    return null;
  }

  return factionBadges[badge.hash];
}

/**
 * Check to see if this item has a node that restricts it to a
 * certain faction, and if the character is aligned with that
 * faction.
 */
export function factionItemAligns(store: DimStore, item: D1Item) {
  if (!item.talentGrid) {
    return true;
  }

  const factionNode = item.talentGrid.nodes.find((n) => factionNodes[n.hash]);
  if (!factionNode) {
    return true;
  }

  return factionNodes[factionNode.hash] === factionAlignment(store);
}

/**
 * Whether or not this character is aligned with the given faction definition hash.
 */
export function factionAligned(store: DimStore, factionHash: number) {
  const alignment = factionAlignment(store);

  return alignment === factionsByHash[factionHash];
}
