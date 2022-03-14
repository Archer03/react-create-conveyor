import produce from 'immer';

/**
 * compare changes for selected
 */
export const selectedChanged = (preSelected, execSelect) => {
  const { selected: nextSelected, trackAsRet } = execSelect();
  if (!isPlainObject(nextSelected) || trackAsRet) {
    return !Object.is(preSelected, nextSelected);
  }
  return Object.entries(preSelected)
    // for task props as function, the state it depends will always be latest, so ignore it
    .filter(([, value]) => typeof value !== 'function')
    .some(([key, value]) => !Object.is(value, nextSelected[key]));
}

/**
 * create new root state
 */
export const getNewState = (curRoot, execSelect, work) => {
  const { selected, pathArr, trackAsRet } = execSelect();
  let newState = null;
  if (typeof work === 'function') {
    let toBeModify = null;
    if (pathArr.length === 0) {
      toBeModify = curRoot;
    } else {
      toBeModify = selected;
      if (isPlainObject(selected) && !trackAsRet) {
        toBeModify = { ...selected };
        Object.keys(toBeModify).forEach((key, index) => {
          if (index >= pathArr.length) {
            Object.defineProperty(toBeModify, key, { writable: false });
          }
        });
      }
    }
    const nextSlice = isPrimitive(toBeModify) ? work(toBeModify) : produce(toBeModify, work);
    if (pathArr.length === 0) {
      newState = nextSlice;
    } else {
      newState = syncChangesToRootByPath(curRoot, nextSlice, pathArr, trackAsRet);
    }
  } else if (selected !== curRoot) {
    // this happens only when selector works with new mapping passed
    if (pathArr.length !== 1) throw ('to set value directly, please return single a value for selector!');
    newState = syncChangesToRootByPath(curRoot, work, pathArr, true);
  } else { // work is new root state
    newState = work;
  }
  return newState;
}

/**
 * sync changes from slice to root state
 */
export const syncChangesToRootByPath = (curRoot, nextSlice, pathArr, justSetValue) => {
  if (!pathArr.length) throw ('track prop needed!'); // throw for savety
  return produce(curRoot, draft => {
    if (!isPlainObject(curRoot) || justSetValue) {
      const paths = pathArr[0].path.slice();
      const lastKey = paths.pop();
      paths.reduce((p, v) => p[v], draft)[lastKey] = nextSlice;
    } else {
      Object.entries(nextSlice).forEach(([key, value], index) => {
        if (index >= pathArr.length) return;
        const paths = pathArr[index].path.slice();
        const lastKey = paths.pop();
        paths.reduce((p, v) => p[v], draft)[lastKey] = value;
      });
    }
  })
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