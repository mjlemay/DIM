import { deepEqual } from 'fast-equals';
import { Dispatch, isAction, Middleware, MiddlewareAPI } from 'redux';
import { createAction, createCustomAction, isActionOf } from 'typesafe-actions';
import { RootState } from './types';

interface StoreObserver<T> {
  id: string;
  /**
   * Function to create "something" which will be used to determine if the side effect should run.
   * deepEqual is used for the comparison, so use primitives, shallow objects or arrays to keep
   * performance reasonable.
   */
  getObserved: (rootState: RootState) => T;
  /**
   * Runs the side effect providing both the previous and current version of the derrived state.
   */
  sideEffect: (states: { previous: T; current: T }) => void;
}

// Need to user a higher order function to get the correct typings and inference, it will now correctly
// type the value of T based on what the getObserved returns
const observe = <T>(storeObserver: StoreObserver<T>) =>
  createCustomAction('observer/OBSERVE', (storeObserver: StoreObserver<T>) => ({ storeObserver }))(
    storeObserver,
  );
const unobserve = createAction('observer/UNOBSERVE')<string>();
const clearObservers = createAction('observer/CLEAR_OBSERVERS')();

export function observerMiddleware<D extends Dispatch>(
  api: MiddlewareAPI<D, RootState>,
): ReturnType<Middleware> {
  const observers = new Map<string, StoreObserver<unknown>>();
  return (next) => (action) => {
    if (!isAction(action)) {
      return next(action);
    }

    if (isActionOf(observe, action)) {
      observers.set(action.storeObserver.id, action.storeObserver);
      return;
    }

    if (isActionOf(unobserve, action)) {
      observers.delete(action.payload);
      return;
    }

    if (isActionOf(clearObservers, action)) {
      observers.clear();
      return;
    }

    const previousRootState = api.getState();
    const result = next(action);
    const currentRootState = api.getState();

    for (const [_id, observer] of observers) {
      const previous = observer.getObserved(previousRootState);
      const current = observer.getObserved(currentRootState);
      if (deepEqual(previous, current)) {
        observer.sideEffect({ previous, current });
      }
    }

    return result;
  };
}
