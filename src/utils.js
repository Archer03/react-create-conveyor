import produce from 'immer';

/**
 * compare changes for selected
 */
 export const selectedChanged = (preSelected, nextSelected) => {
  if (Object.prototype.toString.call(preSelected) === '[object Object]') {
    return Object.entries(preSelected)
      // for task props as function, the state it depends will always be latest, so ignore it
      .filter(([, value]) => typeof value !== 'function')
      .some(([key, value]) => !Object.is(value, nextSelected[key]));
  }
  return !Object.is(preSelected, nextSelected);
}

/**
 * create new root state
 */
export const getNewState = (curRoot, selected, pathArr, work) => {
  let newState = null;
  if (typeof work === 'function') {
    const nextSlice = produce(pathArr.length ? selected : curRoot, work);
    newState = pathArr.length ? syncChangesToRootByPath(curRoot, selected, nextSlice, pathArr) : nextSlice;
  } else if (selected !== curRoot) { // it happens only when maping passed to selector
    if (pathArr.length !== 1) throw ('to set value directly, please track single prop!');
    newState = syncChangesToRootByPath(curRoot, selected, work, pathArr);
  } else {
    newState = work;
  }
  return newState;
}

/**
 * sync changes from slice to root state
 */
export const syncChangesToRootByPath = (curRoot, selected, nextSlice, pathArr) => {
  if (!pathArr.length) throw ('track prop needed!'); // throw for savety
  // track as selector ret is like: useMyData(({ track }) => track('dog'))
  const trackAsSelectorRet = pathArr[0].ret === selected;
  return produce(curRoot, draft => {
    if (Object.prototype.toString.call(nextSlice) !== '[object Object]' || trackAsSelectorRet) {
      // this case for no relationship mapped by new key, just think about selector return a value
      // and only single key would be tracked here
      const paths = pathArr[0].path.slice();
      const lastKey = paths.pop();
      paths.reduce((p, v) => p[v], draft)[lastKey] = nextSlice;
    } else {
      Object.entries(nextSlice).forEach(([key, value], index) => {
        if (index > pathArr.length - 1) return; // todo 有没有其他方式对应key?
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