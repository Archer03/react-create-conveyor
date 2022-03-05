import { useEffect, useReducer, useCallback, useRef } from 'react';
import produce from 'immer';

export const createConveyor = state => {
  const updaters = new Set();
  return selector => {
    const track = (...path) => {
      if (path.length === 0) throw ('path needed!');
      !ignoreTrack && pathArr.push(path);
      return path.reduce((p, v) => p[v], state);
    }
    const task = (reducer => {
      return (...params) => {
        const nextSlice = produce(hasTrack ? selected : state, draft => reducer(draft, ...params));
        const newState = syncChangesToState(state, nextSlice, pathArr);
        if (Object.is(state, newState)) return;
        state = newState;
        updaters.forEach(doCheck => doCheck());
      }
    })
    const { current: oldMemoDeps } = useRef([]);
    const { current: oldMemoValues } = useRef([]);
    const memoIndex = useRef(0);
    const memo = (computedFn, deps) => {
      const index = memoIndex.current++;
      const oldDeps = oldMemoDeps[index];
      let changed = !oldDeps || oldDeps.some((old, i) => !Object.is(old, deps[i]));
      if (changed) {
        oldMemoDeps[index] = deps.slice();
        return oldMemoValues[index] = computedFn();
      } else {
        return oldMemoValues[index];
      }
    }
    const execSelector = () => {
      if (!selector) return [false, state];
      const select = selector({ state, track, task, memo });
      memoIndex.current = 0;
      return [pathArr.length !== 0, select];
    }

    const pathArr = [];
    let ignoreTrack = false;
    const [hasTrack, selected] = execSelector();
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const doCheck = () => {
      ignoreTrack = true;
      const [, next] = execSelector();
      if (selector && !stateChanged(selected, next)) return;
      forceUpdate();
    }

    useEffect(() => {
      updaters.add(doCheck);
      return () => updaters.delete(doCheck);
    }, [selected, selector]); // 事实上selector每次都会变

    return [
      selected,
      useCallback(work => {
        let newState = null;
        if (typeof work === 'function') {
          const nextSlice = produce(hasTrack ? selected : state, work);
          newState = syncChangesToState(state, nextSlice, pathArr);
        } else if (selector) {
          if (pathArr.length === 0) throw ('track needed!');
          if (pathArr.length > 1)
            throw ('more than one props are tracked, only function is allowed to pass for updating.');
          newState = produce(state, draft => {
            const path = pathArr[0].slice();
            const lastKey = path.pop();
            path.reduce((p, v) => p[v], draft)[lastKey] = work;
          })
        } else {
          newState = work;
        }
        if (Object.is(state, newState)) return;
        state = newState;
        updaters.forEach(doCheck => doCheck());
      }, [selector, pathArr]) // 事实上selector和pathArr每次都会变
    ];
  }
}

/**
 * check should update
 */
const stateChanged = (preSelected, nextSelected) => {
  if (Object.prototype.toString.call(preSelected) === '[object Object]') {
    return Object.entries(preSelected)
      // for task props as function, the state it depends will always be latest, so ignore it
      .filter(([, value]) => typeof value !== 'function')
      .some(([key, value]) => !Object.is(value, nextSelected[key]));
  }
  return !Object.is(preSelected, nextSelected);
}

/**
 * get a new root state
 */
const syncChangesToState = (state, nextSlice, pathArr) => {
  if (pathArr.length === 0) { // if not tracked, nextSlice will always be next state 
    return nextSlice;
  }
  return produce(state, draft => {
    if (Object.prototype.toString.call(nextSlice) !== '[object Object]') {
      const paths = pathArr[0].slice();
      const lastKey = paths.pop();
      paths.reduce((p, v) => p[v], draft)[lastKey] = nextSlice;
    } else {
      Object.entries(nextSlice).forEach(([key, value], index) => {
        if (index > pathArr.length - 1) return; // todo 有没有其他方式对应key?
        const paths = pathArr[index].slice();
        const lastKey = paths.pop();
        paths.reduce((p, v) => p[v], draft)[lastKey] = value;
      });
    }
  })
}