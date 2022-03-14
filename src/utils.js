import produce from 'immer';

/**
 * compare changes for selected
 */
export const selectedChanged = (preSelected, execSelect) => {
  const { selected, selectorRet, trackIsRet } = execSelect();
  if (!trackIsRet && selectorRet instanceof Map) {
    return Object.entries(preSelected)
      // for task props as function, the state will always be latest, so ignore it
      .filter(([, value]) => typeof value !== 'function') // @todo 函数可能依赖了闭包变量，所以不能忽略？
      .some(([key, value]) => !Object.is(value, selected[key]));
  }
  return !Object.is(preSelected, selected);
}

/**
 * create new root state
 */
export const getNewState = (curRoot, execSelect, work) => {
  const { draft, selectorRet, trackIsRet } = execSelect();
  // only 3 case is allowed here: draft is root, track is ret, use mapping
  let newState = null;
  if (typeof work === 'function') {
    const nextSlice = isPrimitive(draft) ? work(draft) : produce(draft, work);
    if (curRoot === draft) {
      newState = nextSlice;
    } else if (trackIsRet) {
      newState = produceRootByOnePath(curRoot, nextSlice, selectorRet);
    } else {
      newState = produceRootByMapping(curRoot, nextSlice, selectorRet);
    }
  } else if (curRoot === draft) {
    newState = work;
  } else if (trackIsRet) {
    newState = produceRootByOnePath(curRoot, work, selectorRet);
  } else {
    throw ('to set value directly, do not return a map for selector!');
  }
  return newState;
}

/**
 * update changes to root state by map
 */
export const produceRootByMapping = (curRoot, nextSlice, mapping) => {
  return produce(curRoot, draft => {
    Object.entries(nextSlice).forEach(([key, value]) => {
      const paths = mapping.get(key).slice();
      const lastKey = paths.pop();
      paths.reduce((p, v) => p[v], draft)[lastKey] = value;
    });
  })
}

/**
 * modify a prop value for root state
 */
export const produceRootByOnePath = (curRoot, next, path) => {
  return produce(curRoot, draft => {
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