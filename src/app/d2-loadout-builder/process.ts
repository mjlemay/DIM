import _ from 'lodash';
import { D2Item, DimItem } from '../inventory/item-types';
import {
  LockableBuckets,
  ArmorSet,
  StatTypes,
  LockedItemType,
  ItemsByBucket,
  LockedMap
} from './types';
import { getNumValidSets, filterPlugs } from './generated-sets/utils';

export const statHashes = {
  Mobility: 2996146975,
  Resilience: 392767087,
  Recovery: 1943323491
};

/**
 * Filter the items map down given the locking and filtering configs.
 */
export function filterItems(
  items: ItemsByBucket,
  requirePerks: boolean,
  lockedMap: LockedMap,
  filter: (item: DimItem) => boolean
): ItemsByBucket {
  const filteredItems: { [bucket: number]: readonly D2Item[] } = {};

  Object.keys(items).forEach((bucketStr) => {
    const bucket = parseInt(bucketStr, 10);
    const locked = lockedMap[bucket];

    // if we are locking an item in that bucket, filter to only include that single item
    if (locked && locked.length) {
      const lockedItem = locked[0];
      if (lockedItem.type === 'item') {
        filteredItems[bucket] = [lockedItem.item];
        return;
      }
    }

    // otherwise flatten all item instances to each bucket
    filteredItems[bucket] = items[bucket].filter(filter);
    if (!filteredItems[bucket].length) {
      // If nothing matches, just include everything so we can make valid sets
      filteredItems[bucket] = items[bucket];
    }

    // filter out low-tier items and items without extra perks on them
    if (requirePerks) {
      filteredItems[bucket] = filteredItems[bucket].filter(
        (item) =>
          item &&
          ['Exotic', 'Legendary'].includes(item.tier) &&
          item.sockets &&
          item.sockets.categories &&
          item.sockets.categories.length === 2 &&
          item.sockets.sockets
            .filter(filterPlugs)
            // this will exclude the deprecated pre-forsaken mods
            .filter(
              (socket) =>
                socket.plug && !socket.plug.plugItem.itemCategoryHashes.includes(4104513227)
            ).length
      );
    }
  });

  // filter to only include items that are in the locked map
  Object.keys(lockedMap).forEach((bucketStr) => {
    const bucket = parseInt(bucketStr, 10);
    const locked = lockedMap[bucket];
    // if there are locked items for this bucket
    if (locked && locked.length && filteredItems[bucket]) {
      filteredItems[bucket] = filteredItems[bucket].filter((item) =>
        locked.every((lockedItem) => matchLockedItem(item, lockedItem))
      );
    }
  });

  return filteredItems;
}

function matchLockedItem(item: D2Item, lockedItem: LockedItemType) {
  switch (lockedItem.type) {
    case 'exclude':
      return item.id !== lockedItem.item.id;
    case 'burn':
      return item.dmg === lockedItem.burn.dmg;
    case 'perk':
      return (
        item.sockets &&
        item.sockets.sockets.some((slot) =>
          slot.plugOptions.some((plug) => lockedItem.perk.hash === plug.plugItem.hash)
        )
      );
    case 'item':
      return item.id === lockedItem.item.id;
  }
}

/**
 * This processes all permutations of armor to build sets
 * @param filteredItems pared down list of items to process sets from
 */
export function process(filteredItems: ItemsByBucket): ArmorSet[] {
  const pstart = performance.now();
  const helms = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.helmet] || [], (i) => -i.basePower),
    byStatMix
  );
  const gaunts = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.gauntlets] || [], (i) => -i.basePower),
    byStatMix
  );
  const chests = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.chest] || [], (i) => -i.basePower),
    byStatMix
  );
  const legs = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.leg] || [], (i) => -i.basePower),
    byStatMix
  );
  const classitems = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.classitem] || [], (i) => -i.basePower),
    byStatMix
  );
  const ghosts = multiGroupBy(
    _.sortBy(filteredItems[LockableBuckets.ghost] || [], (i) => !i.isExotic),
    byStatMix
  );
  const setMap: ArmorSet[] = [];

  const helmsKeys = Object.keys(helms);
  const gauntsKeys = Object.keys(gaunts);
  const chestsKeys = Object.keys(chests);
  const legsKeys = Object.keys(legs);
  const classItemsKeys = Object.keys(classitems);
  const ghostsKeys = Object.keys(ghosts);

  const combos =
    helmsKeys.length *
    gauntsKeys.length *
    chestsKeys.length *
    legsKeys.length *
    classItemsKeys.length *
    ghostsKeys.length;

  if (combos === 0) {
    return [];
  }

  let processedCount = 0;
  for (const helmsKey of helmsKeys) {
    for (const gauntsKey of gauntsKeys) {
      for (const chestsKey of chestsKeys) {
        for (const legsKey of legsKeys) {
          for (const classItemsKey of classItemsKeys) {
            for (const ghostsKey of ghostsKeys) {
              const stats: { [statType in StatTypes]: number } = {
                Mobility: 0,
                Resilience: 0,
                Recovery: 0
              };

              const set: ArmorSet = {
                id: processedCount,
                armor: [
                  helms[helmsKey],
                  gaunts[gauntsKey],
                  chests[chestsKey],
                  legs[legsKey],
                  classitems[classItemsKey],
                  ghosts[ghostsKey]
                ],
                statChoices: [
                  helmsKey,
                  gauntsKey,
                  chestsKey,
                  legsKey,
                  classItemsKey,
                  ghostsKey
                ].map((key) => key.split(',').map((val) => parseInt(val, 10))),
                stats
              };

              for (const stat of set.statChoices) {
                stats.Mobility += stat[0];
                stats.Resilience += stat[1];
                stats.Recovery += stat[2];
              }

              if (getNumValidSets(set)) {
                setMap.push(set);
              }
              processedCount++;
            }
          }
        }
      }
    }
  }

  console.log(
    'found',
    Object.keys(setMap).length,
    'sets after processing',
    combos,
    'combinations in',
    performance.now() - pstart,
    'ms'
  );

  return setMap;
}

function multiGroupBy<T>(items: T[], mapper: (item: T) => string[]) {
  const map: { [key: string]: T[] } = {};
  for (const item of items) {
    for (const result of mapper(item)) {
      map[result] = map[result] || [];
      map[result].push(item);
    }
  }
  return map;
}

function byStatMix(item: D2Item) {
  const mixes: string[] = [];

  const stat = item.stats;

  if (!stat || stat.length < 3) {
    return ['0,0,0'];
  }

  if (stat && item.sockets) {
    for (const socket of item.sockets.sockets) {
      if (socket.plugOptions.length > 1) {
        for (const plug of socket.plugOptions) {
          if (plug.plugItem && plug.plugItem.investmentStats.length) {
            const statBonuses = _.mapValues(statHashes, (h) => {
              const stat = plug.plugItem.investmentStats.find((s) => s.statTypeHash === h);
              return stat ? stat.value : 0;
            });

            mixes.push(
              [
                stat[0].base + statBonuses.Mobility,
                stat[1].base + statBonuses.Resilience,
                stat[2].base + statBonuses.Recovery
              ].toString()
            );
          }
        }
      }
    }
  }

  // TODO: should record selected perk?

  if (mixes.length !== 0) {
    return _.uniq(mixes);
  }

  return [[stat[0].value || 0, stat[1].value || 0, stat[2].value || 0].toString()];
}
