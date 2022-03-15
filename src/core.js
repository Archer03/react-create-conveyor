import { useEffect, useReducer, useCallback, useRef } from 'react';
import { getNewState, hitSoy, isPlainObject, newPromise, selectedChanged } from './utils';

const GET_STATE = Symbol();
const CHECK_UPDATE = Symbol();
const ON_CHECK = Symbol();
const UPDATERS = Symbol();
const ASSIGN_MAP = Symbol();
export const TRACK_AS_RET = Symbol();

export const createInstance = (state, debugTarget) => {
  const updaters = new Set();
  const assignmentMap = new Map();
  const onCheckUpdate = [];
  let checkPromise, checkResolve;
  const checkShouldUpdate = next => {
    if (Object.is(state, next)) return Promise.resolve();
    hitSoy(state, next, debugTarget);
    state = next;
    const cbPromise = new Promise(res => {
      Promise.all([onCheckUpdate.map(cb => Promise.resolve(cb()))]).then(res);
    });
    if (checkPromise) return Promise.all([checkPromise, cbPromise]);
    [checkPromise, checkResolve] = newPromise();
    queueMicrotask(() => {
      checkPromise = null;
      Promise.all([...updaters].map(doCheck => doCheck())).then(() => {
        checkResolve();
        checkResolve = null;
      });
    })
    return Promise.all([checkPromise, cbPromise]);
  }
  const selfInstance = {
    [GET_STATE]: () => state,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ON_CHECK]: onCheckUpdate,
    [UPDATERS]: updaters,
    [ASSIGN_MAP]: assignmentMap,
  };
  selfInstance.register = register.bind(null, selfInstance);
  selfInstance.dispatch = dispatch.bind(null, selfInstance);
  selfInstance.assemble = assemble.bind(null, selfInstance);
  return selfInstance;
}

/**
 * useConveyor hook
 */
export const useConveyor = (selector, conveyor) => {
  const { [GET_STATE]: getRoot, [CHECK_UPDATE]: checkShouldUpdate, [UPDATERS]: updaters } = conveyor;
  const track = (pathSet, ...path) => {
    if (path.length === 0) throw ('path needed!');
    pathSet.add(path)
    return path;
  }
  const task = (reducer => {
    return (...params) => {
      const work = draft => reducer(draft, ...params);
      const newState = getNewState(getRoot(), execSelect, work);
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

  const execSelect = () => {
    const mapping = new Map();
    if (!selector) return { selected: getRoot(), draft: getRoot(), mapping };
    if (!isPlainObject(getRoot())) {
      throw ('only state of plain object deserves a selector for mapping!');
    }
    const pathSet = new Set();
    const v = (key, value) => mapping.set(key, value);
    let selectorRet = selector({ v, track: track.bind(null, pathSet), task, memo, state: getRoot });
    memoIndex.current = 0;
    let selected = {};
    let draft = {};
    if (pathSet.has(selectorRet)) {
      const path = selectorRet;
      mapping.set(TRACK_AS_RET, path);
      selected = draft = path.reduce((p, v) => p[v], getRoot());
    } else if (mapping.size > 0) {
      [...mapping.entries()].forEach(([key, value]) => {
        if (pathSet.has(value)) {
          selected[key] = draft[key] = value.reduce((p, v) => p[v], getRoot());
        } else {
          selected[key] = value;
        }
      });
      if (Object.keys(draft).length === 0) draft = getRoot();
    } else {
      throw ('please at least map a prop or return a tracked prop for selector!');
    }
    return { selected, draft, mapping };
  }
  const { selected } = execSelect();

  const renderRef = useRef(null);
  renderRef.current && renderRef.current();
  renderRef.current = null;
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const doCheck = () => {
    if (selector && !selectedChanged(selected, execSelect)) return Promise.resolve();
    const ret = new Promise(res => renderRef.current = res);
    forceUpdate(); // first time forceUpdate render sync and takes more time
    return ret;
  }
  useEffect(() => {
    updaters.add(doCheck);
    return () => updaters.delete(doCheck);
  }, [selected, selector]); // 事实上selector每次都会变

  return [
    selected,
    useCallback(work => {
      const newState = getNewState(getRoot(), execSelect, work);
      checkShouldUpdate(newState);
    }, [selector])
  ];
}

/**
 * register assignment by unique type
 */
export const register = (conveyor, type, assignment) => {
  const { [ASSIGN_MAP]: assignmentMap } = conveyor;
  if (assignmentMap.get(type)) throw ('duplicate type added!');
  assignmentMap.set(type, assignment);
}

/**
 * dispatch an assignment to do
 */
export const dispatch = (conveyor, action, cancelSignal, cancelCallback) => {
  const { [GET_STATE]: getRoot,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ASSIGN_MAP]: assignmentMap } = conveyor;
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');
  let cancelled = false;
  cancelSignal && cancelSignal.then(() => {
    cancelled = true;
    cancelCallback && cancelCallback();
  });
  const track = (pathSet, ...path) => {
    if (path.length === 0) throw ('path needed!');
    pathSet.add(path)
    return path;
  }
  let putPromise = null;
  const selectToPut = selector => {
    const execSelect = () => {
      const mapping = new Map();
      if (!selector) return { selected: getRoot(), draft: getRoot(), mapping };
      if (!isPlainObject(getRoot())) {
        throw ('only state of plain object deserves a selector for mapping!');
      }
      const pathSet = new Set();
      const selectorRet = selector(track.bind(null, pathSet));
      let selected = {};
      if (pathSet.has(selectorRet)) {
        const path = selectorRet;
        mapping.set(TRACK_AS_RET, path);
        selected = path.reduce((p, v) => p[v], getRoot());
      } else if (!isPlainObject(selectorRet)) {
        throw ('please return a plain object or tracked prop for selector!');
      } else {
        Object.entries(selectorRet).forEach(([key, value]) => {
          if (pathSet.has(value)) {
            selected[key] = value.reduce((p, v) => p[v], getRoot());
            mapping.set(key, value);
          } else {
            throw ('only tracked prop is allowed in selectToPut for assignment!');
          }
        });
      }
      return { selected, draft: selected, mapping };
    }
    return {
      select: () => execSelect().selected,
      put: work => {
        const newState = getNewState(getRoot(), execSelect, work);
        putPromise = checkShouldUpdate(newState);
      },
      state: getRoot,
      step: promise => new Promise((resolve, reject) => {
        promise.then(res => {
          if (cancelled) return;
          resolve(res);
        }).catch(err => reject(err));
      })
    }
  }

  const [dispatchPromise, dispatchResolve, dispatchReject] = newPromise();
  const done = () => {
    // putPromise is the latest prommise which created from put
    putPromise.then(dispatchResolve);
  }
  assignment(action, { selectToPut, done, fail: dispatchReject });
  return dispatchPromise;
}

/**
 * assemble sub conveyor
 */
export const assemble = (parentConveyor, alias, childConveyor) => {
  const { [GET_STATE]: getChildState,
    [CHECK_UPDATE]: childCheckShouldUpdate,
    [ON_CHECK]: onChildCheck } = childConveyor;
  const {
    [GET_STATE]: getParentState,
    [CHECK_UPDATE]: parentCheckShouldUpdate,
    [ON_CHECK]: onParentCheck
  } = parentConveyor;
  const parentState = getParentState();
  if (!isPlainObject(parentState)) {
    throw ('conveyor of non-plain object type could not assemble sub conveyor!');
  }
  if (Object.keys(parentState).find(key => key === alias)) {
    throw ('existing key on target conveyor state!');
  }
  parentState[alias] = getChildState();
  onChildCheck.push(childNode => {
    return parentCheckShouldUpdate({ ...parentState, [alias]: childNode });
  });
  onParentCheck.push(parentNode => {
    if (!Object.is(getChildState(), parentNode[alias])) {
      return childCheckShouldUpdate(parentNode[alias]);
    }
    return Promise.resolve();
  })
}