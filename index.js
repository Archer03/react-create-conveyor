import { useEffect, useReducer, useCallback, useRef } from 'react';
import produce from 'immer';

export const createConveyor = state => {
  const updaters = new Set();
  const assignmentMap = new Map();
  const getState = () => state;
  let pendingUpdate = false;
  const checkShouldUpdate = newState => {
    if (Object.is(state, newState)) return;
    state = newState;
    if (pendingUpdate) return;
    pendingUpdate = true;
    queueMicrotask(() => {
      pendingUpdate = false;
      updaters.forEach(doCheck => doCheck());
    })
  }
  // [hook, register, dispatch]
  return [
    selector => {
      const pathArr = [];
      let ignoreTrack = false;
      const track = (...path) => {
        if (path.length === 0) throw ('path needed!');
        !ignoreTrack && pathArr.push(path);
        return path.reduce((p, v) => p[v], state);
      }
      const task = (reducer => {
        return (...params) => {
          const work = draft => reducer(draft, ...params);
          const newState = getNewState(selected, state, pathArr, work);
          checkShouldUpdate(newState);
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
        if (!selector) return state;
        const select = selector({ state: getState, track, task, memo });
        memoIndex.current = 0;
        return select;
      }
      const selected = execSelector();
      const [, forceUpdate] = useReducer(x => x + 1, 0);
      const doCheck = () => {
        ignoreTrack = true;
        if (selector && !stateChanged(selected, execSelector())) return;
        forceUpdate();
      }

      useEffect(() => {
        updaters.add(doCheck);
        return () => updaters.delete(doCheck);
      }, [selected, selector]); // 事实上selector每次都会变

      return [
        selected,
        useCallback(work => {
          const newState = getNewState(selected, state, pathArr, work);
          checkShouldUpdate(newState);
        }, [selector])
      ];
    },
    // register
    (...params) => {
      register(...params, assignmentMap);
    },
    // dispatch
    action => {
      dispatch(action, assignmentMap, getState, checkShouldUpdate);
    }
  ]
}

/**
 * compare changes for selected
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
 * sync changes from slice to root state
 */
const syncChangesToState = (state, nextSlice, pathArr) => {
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

/**
 * create new root state
 */
const getNewState = (selected, state, pathArr, work) => {
  let newState = null;
  if (typeof work === 'function') {
    const nextSlice = produce(pathArr.length ? selected : state, work);
    newState = pathArr.length ? syncChangesToState(state, nextSlice, pathArr) : nextSlice;
  } else if (selected !== state) { // it happens only when selector executed
    if (pathArr.length !== 1) throw ('to set value directly, please track single prop!');
    newState = syncChangesToState(state, work, pathArr);
  } else {
    newState = work;
  }
  return newState;
}

/**
 * register assignment by unique type
 */
const register = (type, assignment, assignmentMap) => {
  if (assignmentMap.get(type)) throw ('duplicate type added!');
  assignmentMap.set(type, assignment);
}

/**
 * dispatch an assignment to do
 */
const dispatch = (action, assignmentMap, getState, checkShouldUpdate) => {
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');
  const pathArr = [];
  let ignoreTrack = false;
  const track = (...path) => {
    if (path.length === 0) throw ('path needed!');
    !ignoreTrack && pathArr.push(path);
    return path.reduce((p, v) => p[v], getState());
  }
  const selectToPut = selector => {
    if (selector) {
      selector(track);
      ignoreTrack = true;
    }
    const operators = {
      select: () => selector ? selector(track) : getState(),
      put: work => {
        const newState = getNewState(operators.select(), getState(), pathArr, work);
        checkShouldUpdate(newState);
      },
      state: getState
    }
    return operators;
  }
  assignment(action, selectToPut);
}