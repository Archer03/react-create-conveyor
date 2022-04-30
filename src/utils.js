import produce from 'immer';
import { EDIT_AS_RET, ROOT_AS_DRAFT, SELECT_AS_RET } from './core';

/**
 * compare changes for selected
 */
export const selectedChanged = (preSelected, selectInfo) => {
  const { selected, mapping } = selectInfo;
  if (mapping.has(SELECT_AS_RET)) {
    return Object.entries(preSelected)
      .some(([key, value]) => !Object.is(value, selected[key]));
  }
  return !Object.is(preSelected, selected);
}

/**
 * create new root state
 */
export const produceNewState = (curRoot, selectInfo, work) => {
  const { draft, mapping } = selectInfo;
  const singleEdit = mapping.get(EDIT_AS_RET);
  // only 3 case is allowed here: root as draft, edit as ret, select as ret
  let newState = null;
  if (typeof work === 'function') {
    const nextSlice = produce(draft, work);
    if (mapping.has(ROOT_AS_DRAFT)) {
      newState = nextSlice;
    } else if (singleEdit) {
      newState = produceByOnePath(curRoot, nextSlice, singleEdit);
    } else {
      newState = produceByMapping(curRoot, nextSlice, mapping.get(SELECT_AS_RET));
    }
  } else if (mapping.has(ROOT_AS_DRAFT)) {
    newState = work;
  } else if (singleEdit) {
    newState = produceByOnePath(curRoot, work, singleEdit);
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
 * if props changed, debugEntry function will be executed
 */
export const hitSoy = (preState, nextState, [debugProps, debugEntry]) => {
  if (!debugProps?.length) {
    debugProps = [[]];
  }
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
}

/**
 * return a promise which can be aborted by abortSignal
 */
export const abortablePromise = (promise, abortSignal) => promise.then(res => {
  if (abortSignal.aborted) return new Promise(() => { });
  return res;
}, error => {
  if (abortSignal.aborted) return new Promise(() => { });
  return error;
});

/**
 * transfer a promise to an object which provides step & catch methods
 * use step to make every step abortable
 */
export const steptify = (promise, abortSignal) => {
  const abortOrNot = abortSignal ? abortablePromise(promise, abortSignal) : promise;
  return {
    step: (next, error) => steptify(abortOrNot.then(next, error), abortSignal),
    catch: error => steptify(abortOrNot.then(res => res, error), abortSignal)
  }
};

/**
 * subscribe 'AbortError' from abortSignal
 */
export const subscribeAbort = (abortSignal, callback) => {
  const emitAbort = () => {
    const err = new Error(abortSignal.reason);
    err.name = 'AbortError';
    callback(err);
  }
  if (abortSignal.aborted) {
    emitAbort();
  } else {
    abortSignal.addEventListener('abort', function onAbort() {
      emitAbort();
      abortSignal.removeEventListener('abort', onAbort);
    });
  }
}