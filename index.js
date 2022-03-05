import { useEffect, useReducer, useCallback } from 'react';
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
    const execSelector = () => {
      if (!selector) return [false, state];
      const select = selector({ state, track, task });
      return [pathArr.length !== 0, select];
    }

    const pathArr = [];
    let ignoreTrack = false;
    const [hasTrack, selected] = execSelector();
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const doCheck = () => {
      ignoreTrack = true;
      const [, next] = execSelector();
      if (selector && !dataChanged(selected, next)) return;
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

const dataChanged = (preSelected, nextSelected) => {
  if (Object.prototype.toString.call(preSelected) === '[object Object]') {
    return Object.entries(preSelected)
      .filter(([, value]) => typeof value !== 'function') // todo 依赖变了的话也要变吧？先重现 再fix
      .some(([key, value]) => !Object.is(value, nextSelected[key]));
  }
  return !Object.is(preSelected, nextSelected);
}

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