import BungieImage from 'app/dim-ui/BungieImage';
import { SheetHorizontalScrollContainer } from 'app/dim-ui/SheetHorizontalScrollContainer';
import { t } from 'app/i18next-t';
import { locateItem } from 'app/inventory/locate-item';
import { createItemContextSelector } from 'app/inventory/selectors';
import {
  applySocketOverrides,
  useSocketOverridesForItems,
} from 'app/inventory/store/override-sockets';
import { recoilValue } from 'app/item-popup/RecoilStat';
import { useD2Definitions } from 'app/manifest/selectors';
import { statLabels } from 'app/organizer/Columns';
import { armorStats, weaponMasterworkY2SocketTypeHash } from 'app/search/d2-known-values';
import Checkbox from 'app/settings/Checkbox';
import { useSetting } from 'app/settings/hooks';
import { AppIcon, faAngleLeft, faAngleRight, faList } from 'app/shell/icons';
import { acquisitionRecencyComparator } from 'app/shell/item-comparators';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { emptyArray } from 'app/utils/empty';
import { DestinyDisplayPropertiesDefinition } from 'bungie-api-ts/destiny2';
import clsx from 'clsx';
import { BucketHashes, StatHashes } from 'data/d2/generated-enums';
import _ from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import Sheet from '../dim-ui/Sheet';
import { DimItem, DimSocket } from '../inventory/item-types';
import { chainComparator, compareBy, reverseComparator } from '../utils/comparators';
import styles from './Compare.m.scss';
import CompareItem from './CompareItem';
import CompareSuggestions from './CompareSuggestions';
import { endCompareSession, removeCompareItem, updateCompareQuery } from './actions';
import { CompareSession } from './reducer';
import { compareItemsSelector, compareOrganizerLinkSelector } from './selectors';

export interface StatInfo {
  id: number | 'EnergyCapacity' | 'StatDistance';
  displayProperties: DestinyDisplayPropertiesDefinition;
  min: number;
  max: number;
  statMaximumValue: number;
  bar: boolean;
  enabled: boolean;
  lowerBetter: boolean;
  getStat: StatGetter;
}

/** a DimStat with, at minimum, a statHash */
export interface MinimalStat {
  statHash: number;
  value: number;
  base?: number;
}
type StatGetter = (item: DimItem) => undefined | MinimalStat;

// TODO: replace rows with Column from organizer
// TODO: CSS grid-with-sticky layout
// TODO: dropdowns for query buttons
// TODO: freeform query
// TODO: Allow minimizing the sheet (to make selection easier)
export default function Compare({ session }: { session: CompareSession }) {
  const dispatch = useThunkDispatch();
  const defs = useD2Definitions()!;
  const [compareBaseStats, setCompareBaseStats] = useSetting('compareBaseStats');
  const [assumeWeaponMasterwork, setAssumeWeaponMasterwork] = useSetting('compareWeaponMasterwork');
  const itemCreationContext = useSelector(createItemContextSelector);
  const rawCompareItems = useSelector(compareItemsSelector(session.vendorCharacterId));
  const organizerLink = useSelector(compareOrganizerLinkSelector);

  /** The stat row to highlight */
  const [highlight, setHighlight] = useState<string | number>();
  /** The stat row to sort by */
  const [sortedHash, setSortedHash] = useState<string | number>();
  const [sortBetterFirst, setSortBetterFirst] = useState<boolean>(true);
  const [socketOverrides, onPlugClicked] = useSocketOverridesForItems();

  const comparingArmor = rawCompareItems[0]?.bucket.inArmor;
  const comparingWeapons = rawCompareItems[0]?.bucket.inWeapons;
  const doCompareBaseStats = Boolean(compareBaseStats && comparingArmor);
  const doAssumeWeaponMasterworks = Boolean(defs && assumeWeaponMasterwork && comparingWeapons);

  // Produce new items which have had their sockets changed
  const compareItems = useMemo(() => {
    let items = rawCompareItems;
    if (doAssumeWeaponMasterworks) {
      items = items.map((i) => {
        const y2MasterworkSocket = i.sockets?.allSockets.find(
          (socket) => socket.socketDefinition.socketTypeHash === weaponMasterworkY2SocketTypeHash
        );
        const plugSet = y2MasterworkSocket?.plugSet;
        const plugged = y2MasterworkSocket?.plugged;
        if (plugSet && plugged) {
          const fullMasterworkPlug = _.maxBy(
            plugSet.plugs.filter(
              (p) => p.plugDef.plug.plugCategoryHash === plugged.plugDef.plug.plugCategoryHash
            ),
            (plugOption) => plugOption.plugDef.investmentStats[0]?.value
          );
          if (fullMasterworkPlug) {
            return applySocketOverrides(itemCreationContext, i, {
              [y2MasterworkSocket.socketIndex]: fullMasterworkPlug.plugDef.hash,
            });
          }
        }
        return i;
      });
    }
    items = items.map((i) => applySocketOverrides(itemCreationContext, i, socketOverrides[i.id]));

    return items;
  }, [itemCreationContext, doAssumeWeaponMasterworks, rawCompareItems, socketOverrides]);

  const cancel = useCallback(() => {
    dispatch(endCompareSession());
  }, [dispatch]);

  // Reset if there ever are no items
  const hasItems = compareItems.length > 0;
  useEffect(() => {
    if (!hasItems) {
      cancel();
    }
  }, [cancel, hasItems]);

  // If the session was started with a specific item, this is it
  const initialItem = session.initialItemId
    ? compareItems.find((i) => i.id === session.initialItemId)
    : undefined;

  // Memoize computing the list of stats
  const allStats = useMemo(
    () => getAllStats(compareItems, compareBaseStats, initialItem),
    [compareItems, compareBaseStats, initialItem]
  );

  const updateQuery = useCallback(
    (newQuery: string) => {
      dispatch(updateCompareQuery(newQuery));
    },
    [dispatch]
  );

  const remove = useCallback(
    (item: DimItem) => {
      if (compareItems.length <= 1) {
        cancel();
      } else {
        dispatch(removeCompareItem(item));
      }
    },
    [cancel, compareItems.length, dispatch]
  );

  const changeSort = (newSortedHash?: string | number) => {
    // TODO: put sorting together?
    setSortedHash(newSortedHash);
    setSortBetterFirst(sortedHash === newSortedHash ? !sortBetterFirst : true);
  };

  const firstCompareItem = compareItems[0];
  // The example item is the one we'll use for generating suggestion buttons
  const exampleItem = initialItem || firstCompareItem;

  const items = useMemo(() => {
    const comparator = sortCompareItemsComparator(
      sortedHash,
      sortBetterFirst,
      doCompareBaseStats,
      allStats,
      session.initialItemId
    );
    const sortedComparisonItems = Array.from(compareItems).sort(comparator);
    return (
      <CompareItems
        items={sortedComparisonItems}
        allStats={allStats}
        remove={remove}
        setHighlight={setHighlight}
        onPlugClicked={onPlugClicked}
        doCompareBaseStats={doCompareBaseStats}
        initialItemId={session.initialItemId}
      />
    );
  }, [
    allStats,
    compareItems,
    doCompareBaseStats,
    onPlugClicked,
    remove,
    session.initialItemId,
    sortBetterFirst,
    sortedHash,
  ]);

  const header = (
    <div className={styles.options}>
      {comparingArmor && (
        <Checkbox
          label={t('Compare.CompareBaseStats')}
          name="compareBaseStats"
          value={compareBaseStats}
          onChange={setCompareBaseStats}
        />
      )}
      {comparingWeapons && defs && (
        <Checkbox
          label={t('Compare.AssumeMasterworked')}
          name="compareWeaponMasterwork"
          value={assumeWeaponMasterwork}
          onChange={setAssumeWeaponMasterwork}
        />
      )}
      {exampleItem && <CompareSuggestions exampleItem={exampleItem} onQueryChanged={updateQuery} />}
      {organizerLink && (
        <Link className={styles.organizerLink} to={organizerLink}>
          <AppIcon icon={faList} />
          <span>{t('Organizer.OpenIn')}</span>
        </Link>
      )}
    </div>
  );

  return (
    <Sheet onClose={cancel} header={header} allowClickThrough>
      <div className={styles.bucket} onPointerLeave={() => setHighlight(undefined)}>
        <div className={styles.statList}>
          <div className={styles.spacer} />
          {allStats.map((stat) => (
            <div
              key={stat.id}
              className={clsx(styles.statLabel, {
                [styles.sortDesc]: stat.id === sortedHash && sortBetterFirst,
                [styles.sortAsc]: stat.id === sortedHash && !sortBetterFirst,
              })}
              onPointerEnter={() => setHighlight(stat.id)}
              onClick={() => changeSort(stat.id)}
            >
              {stat.displayProperties.hasIcon && (
                <span title={stat.displayProperties.name}>
                  <BungieImage src={stat.displayProperties.icon} />
                </span>
              )}
              {stat.id in statLabels
                ? t(statLabels[stat.id as StatHashes]!)
                : stat.displayProperties.name}{' '}
              {stat.id === sortedHash && (
                <AppIcon icon={sortBetterFirst ? faAngleRight : faAngleLeft} />
              )}
              {stat.id === highlight && <div className={styles.highlightBar} />}
            </div>
          ))}
        </div>
        {items}
      </div>
    </Sheet>
  );
}

function CompareItems({
  items,
  doCompareBaseStats,
  allStats,
  remove,
  setHighlight,
  onPlugClicked,
  initialItemId,
}: {
  initialItemId: string | undefined;
  doCompareBaseStats: boolean;
  items: DimItem[];
  allStats: StatInfo[];
  remove: (item: DimItem) => void;
  setHighlight: React.Dispatch<React.SetStateAction<string | number | undefined>>;
  onPlugClicked: (value: { item: DimItem; socket: DimSocket; plugHash: number }) => void;
}) {
  return (
    <SheetHorizontalScrollContainer>
      {items.map((item) => (
        <CompareItem
          item={item}
          key={item.id}
          stats={allStats}
          itemClick={locateItem}
          remove={remove}
          setHighlight={setHighlight}
          onPlugClicked={onPlugClicked}
          compareBaseStats={doCompareBaseStats}
          isInitialItem={initialItemId === item.id}
        />
      ))}
    </SheetHorizontalScrollContainer>
  );
}

function sortCompareItemsComparator(
  sortedHash: string | number | undefined,
  sortBetterFirst: boolean,
  compareBaseStats: boolean,
  allStats: StatInfo[],
  initialItemId?: string
) {
  if (!sortedHash) {
    return chainComparator(
      compareBy((item) => item.id !== initialItemId),
      acquisitionRecencyComparator
    );
  }

  const sortStat = allStats.find((s) => s.id === sortedHash);

  if (!sortStat) {
    return (_a: DimItem, _b: DimItem) => 0;
  }

  const shouldReverse = sortStat.lowerBetter ? sortBetterFirst : !sortBetterFirst;

  return reverseComparator(
    chainComparator<DimItem>(
      compareBy((item) => {
        const stat = sortStat.getStat(item);
        if (!stat) {
          return -1;
        }
        const statValue = compareBaseStats ? stat.base ?? stat.value : stat.value;
        if (stat.statHash === StatHashes.RecoilDirection) {
          return recoilValue(stat.value);
        }
        return shouldReverse ? -statValue : statValue;
      }),
      compareBy((i) => i.index),
      compareBy((i) => i.name)
    )
  );
}

function getAllStats(
  comparisonItems: DimItem[],
  compareBaseStats: boolean,
  initialItem: DimItem | undefined
): StatInfo[] {
  if (!comparisonItems.length) {
    return emptyArray<StatInfo>();
  }

  const firstComparison = comparisonItems[0];
  compareBaseStats = Boolean(compareBaseStats && firstComparison.bucket.inArmor);
  const stats: StatInfo[] = [];

  if (firstComparison.primaryStat) {
    stats.push(
      makeFakeStat(
        firstComparison.primaryStat.statHash,
        firstComparison.primaryStatDisplayProperties!,
        (item: DimItem) => item.primaryStat || undefined
      )
    );
  }

  if (firstComparison.destinyVersion === 2 && firstComparison.bucket.inArmor) {
    stats.push(
      makeFakeStat(
        'EnergyCapacity',
        t('EnergyMeter.Energy'),
        (item: DimItem) =>
          (item.energy && {
            statHash: item.energy.energyType,
            value: item.energy.energyCapacity,
          }) ||
          undefined,
        { statMaximumValue: 10 }
      )
    );
  }

  if (
    comparisonItems.length > 1 &&
    initialItem?.bucket.inArmor &&
    initialItem.bucket.hash !== BucketHashes.ClassArmor
  ) {
    stats.push(
      makeFakeStat(
        'StatDistance',
        t('Stats.StatDistance'),
        (item: DimItem) => ({
          value: statDistance(item, initialItem),
          statHash: -3,
        }),
        { statMaximumValue: 10, lowerBetter: true }
      )
    );
  }

  // Todo: map of stat id => stat object
  // add 'em up
  const statsByHash: { [statHash: string]: StatInfo } = {};
  for (const item of comparisonItems) {
    if (item.stats) {
      for (const stat of item.stats) {
        let statInfo = statsByHash[stat.statHash];
        if (!statInfo) {
          statInfo = {
            id: stat.statHash,
            displayProperties: stat.displayProperties,
            min: Number.MAX_SAFE_INTEGER,
            max: 0,
            enabled: false,
            lowerBetter: stat.smallerIsBetter,
            statMaximumValue: stat.maximumValue,
            bar: stat.bar,
            getStat(item: DimItem) {
              const itemStat = item.stats
                ? item.stats.find((s) => s.statHash === stat.statHash)
                : undefined;
              return itemStat;
            },
          };
          statsByHash[stat.statHash] = statInfo;
          stats.push(statInfo);
        }
      }
    }
  }

  for (const stat of stats) {
    for (const item of comparisonItems) {
      const itemStat = stat.getStat(item);
      if (itemStat) {
        stat.min = Math.min(
          stat.min,
          (compareBaseStats ? itemStat.base ?? itemStat.value : itemStat.value) || 0
        );
        stat.max = Math.max(
          stat.max,
          (compareBaseStats ? itemStat.base ?? itemStat.value : itemStat.value) || 0
        );
        stat.enabled = stat.min !== stat.max;
      }
    }
  }

  return stats;
}

function makeFakeStat(
  id: StatInfo['id'],
  displayProperties: DestinyDisplayPropertiesDefinition | string,
  getStat: StatGetter,
  { statMaximumValue = 0, bar = false, lowerBetter = false } = {}
): StatInfo {
  if (typeof displayProperties === 'string') {
    displayProperties = { name: displayProperties } as DestinyDisplayPropertiesDefinition;
  }
  return {
    id,
    displayProperties,
    min: Number.MAX_SAFE_INTEGER,
    max: 0,
    enabled: false,
    lowerBetter,
    statMaximumValue,
    getStat,
    bar,
  };
}
function statDistance(item: DimItem, initialItem: DimItem): number {
  const armorStatValues = (item: DimItem) =>
    armorStats.map((statHash) => item.stats?.find((s) => s.statHash === statHash)?.base ?? 0);

  const initialItemStats = armorStatValues(initialItem);
  const compareItemStats = armorStatValues(item);

  console.log({
    initialItemStats,
    compareItemStats,
    distance: Math.sqrt(
      _.sum(_.zip(initialItemStats, compareItemStats).map(([a, b]) => (a! - b!) * (a! - b!)))
    ),
  });

  return Math.sqrt(
    _.sum(_.zip(initialItemStats, compareItemStats).map(([a, b]) => (a! - b!) * (a! - b!)))
  );
}
