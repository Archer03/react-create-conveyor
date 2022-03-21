import produce from 'immer';
import { TRACK_AS_RET, ROOT_AS_DRAFT, SELECT_AS_RET } from './core';

/**
 * compare changes for selected
 */
export const selectedChanged = (preSelected, selectInfo) => {
  const { selected, mapping } = selectInfo;
  if (mapping.has(TRACK_AS_RET) || mapping.has(ROOT_AS_DRAFT)) {
    return !Object.is(preSelected, selected);
  }
  return Object.entries(preSelected)
    .some(([key, value]) => !Object.is(value, selected[key]));
}

/**
 * create new root state
 */
export const produceNewState = (curRoot, selectInfo, work) => {
  const { draft, mapping } = selectInfo;
  const singleTrack = mapping.get(TRACK_AS_RET);
  // only 3 case is allowed here: root as draft, track as ret, select as ret
  let newState = null;
  if (typeof work === 'function') {
    const nextSlice = isPrimitive(draft) ? work(draft) : produce(draft, work);
    if (mapping.has(ROOT_AS_DRAFT)) {
      newState = nextSlice;
    } else if (singleTrack) {
      newState = produceByOnePath(curRoot, nextSlice, singleTrack);
    } else {
      newState = produceByMapping(curRoot, nextSlice, mapping.get(SELECT_AS_RET));
    }
  } else if (mapping.has(ROOT_AS_DRAFT)) {
    newState = work;
  } else if (singleTrack) {
    newState = produceByOnePath(curRoot, work, singleTrack);
  } else {
    throw ('to set value directly, do not create mapping for selector!');
  }
  return newState;
}

/**
 * update changes by selected mappings
 */
export const produceByMapping = (toModify, nextSlice, selectedObj) => {
  return produce(toModify, draft => {
    Object.entries(nextSlice).forEach(([key, value]) => {
      const paths = selectedObj[key].slice();
      const lastKey = paths.pop();
      paths.reduce((p, v) => p[v], draft)[lastKey] = value;
    });
  })
}

/**
 * modify a single prop value
 */
export const produceByOnePath = (toModify, next, path) => {
  return produce(toModify, draft => {
    const keys = path.slice();
    const lastKey = keys.pop();
    keys.reduce((p, v) => p[v], draft)[lastKey] = next;
  });
}

/**
 * if the tracked props changed, debugEntry function will be executed
 */
export const hitSoy = (preState, nextState, [debugProps, debugEntry]) => {
  if (!debugProps) return;
  const changedProps = debugProps.reduce((collected, propPaths) => {
    const pre = propPaths.reduce((p, v) => p[v], preState);
    const next = propPaths.reduce((p, v) => p[v], nextState);
    if (!Object.is(pre, next)) {
      collected.push({ pre, next })
    }
    return collected;
  }, []);
  if (changedProps.length) debugEntry(changedProps);
}

/**
 * get memo value by comparing cache
 */
export const getMemoValue = (key, cacheMap, computeFn, deps) => {
  !cacheMap.get(key) && cacheMap.set(key, {});
  const cache = cacheMap.get(key);
  const changed = !cache.oldDeps || 
    cache.oldDeps.length !== deps.length ||
    cache.oldDeps.some((old, index) => !Object.is(old, deps[index]));
  if (changed) {
    cache.oldDeps = deps.slice();
    return cache.oldValue = computeFn();
  } else {
    return cache.oldValue;
  }
}

export const newPromise = () => {
  let resolve = null;
  let reject = null;
  return [new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  }), resolve, reject];
}

export const isPlainObject = obj => {
  if (typeof obj !== 'object' || obj === null) return false;
  let proto = obj;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(obj) === proto;
  // why not let proto = Object.getPrototypeOf(obj)
  // return !!proto && Object.getPrototypOf(proto) === null
  // for while is more in line with machine?
}

export const isPrimitive = obj => {
  return typeof obj === "boolean" ||
    typeof obj === "number" ||
    typeof obj === "string" ||
    typeof obj === "symbol" ||
    typeof obj === "bigint" ||
    typeof obj === "undefined" ||
    obj === null;
}