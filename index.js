import { useEffect, useReducer, useCallback } from 'react';

export const createConveyor = value => {
  const updaters = new Set();
  const setValue = newVal => {
    if (!Object.is(newVal, value)) {
      value = newVal;
      updaters.forEach(updater => updater());
    }
  }
  return () => {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => {
      updaters.add(forceUpdate);
      return () => updaters.delete(forceUpdate);
    }, []);
    return [value, useCallback(setValue, [])];
  }
}