import { LoadoutParameters, StatConstraint } from '@destinyitemmanager/dim-api-types';
import { WindowVirtualList } from 'app/dim-ui/VirtualList';
import { PluggableInventoryItemDefinition } from 'app/inventory/item-types';
import { DimStore } from 'app/inventory/store-types';
import { Loadout, ResolvedLoadoutItem } from 'app/loadout-drawer/loadout-types';
import { emptyArray } from 'app/utils/empty';
import _ from 'lodash';
import { Dispatch, useMemo } from 'react';
import { LoadoutBuilderAction } from '../loadout-builder-reducer';
import { useAutoMods } from '../process/useProcess';
import {
  ArmorEnergyRules,
  ArmorSet,
  ArmorStatHashes,
  ModStatChanges,
  PinnedItems,
  ResolvedStatConstraint,
} from '../types';
import GeneratedSet, { containerClass } from './GeneratedSet';

/**
 * Renders the entire list of generated stat mixes, one per mix.
 */
export default function GeneratedSets({
  lockedMods,
  pinnedItems,
  selectedStore,
  sets,
  subclass,
  resolvedStatConstraints,
  modStatChanges,
  loadouts,
  lbDispatch,
  params,
  armorEnergyRules,
  notes,
}: {
  selectedStore: DimStore;
  sets: readonly ArmorSet[];
  subclass: ResolvedLoadoutItem | undefined;
  lockedMods: PluggableInventoryItemDefinition[];
  pinnedItems: PinnedItems;
  resolvedStatConstraints: ResolvedStatConstraint[];
  modStatChanges: ModStatChanges;
  loadouts: Loadout[];
  lbDispatch: Dispatch<LoadoutBuilderAction>;
  params: LoadoutParameters;
  armorEnergyRules: ArmorEnergyRules;
  notes?: string;
}) {
  const halfTierMods = useHalfTierMods(
    selectedStore.id,
    Boolean(params.autoStatMods),
    params.statConstraints!
  );

  return (
    <WindowVirtualList
      numElements={sets.length}
      estimatedSize={160}
      itemContainerClassName={containerClass}
      getItemKey={(index) => index}
    >
      {(index) => (
        <GeneratedSet
          set={sets[index]}
          subclass={subclass}
          selectedStore={selectedStore}
          lockedMods={lockedMods}
          pinnedItems={pinnedItems}
          lbDispatch={lbDispatch}
          resolvedStatConstraints={resolvedStatConstraints}
          modStatChanges={modStatChanges}
          loadouts={loadouts}
          params={params}
          halfTierMods={halfTierMods}
          armorEnergyRules={armorEnergyRules}
          notes={notes}
        />
      )}
    </WindowVirtualList>
  );
}

/**
 * Half tier (+5) mods in user stat order so that the quick-add button
 * automatically adds them, but only for stats we care about (and only if we're
 * not adding stat mods automatically ourselves).
 */
function useHalfTierMods(
  selectedStoreId: string,
  autoStatMods: boolean,
  statConstraints: StatConstraint[]
): PluggableInventoryItemDefinition[] {
  // Info about stat mods
  const autoMods = useAutoMods(selectedStoreId);
  return useMemo(
    () =>
      // If we are automatically assigning stat mods, don't even offer half tier quick-add
      autoStatMods
        ? emptyArray()
        : _.compact(
            statConstraints.map(
              (s) => autoMods.generalMods[s.statHash as ArmorStatHashes]?.minorMod
            )
          ),
    [autoMods.generalMods, statConstraints, autoStatMods]
  );
}
