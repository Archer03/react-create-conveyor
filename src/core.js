import { useEffect, useReducer, useCallback, useRef } from 'react';
import { getNewState, hitSoy, newPromise, selectedChanged } from './utils';

const GET_STATE = Symbol();
const CHECK_UPDATE = Symbol();
const ON_UPDATE = Symbol();
const UPDATERS = Symbol();
const ASSIGN_MAP = Symbol();

export const createInstance = (state, debugTarget) => {
  const updaters = new Set();
  const assignmentMap = new Map();
  const onSelfUpdate = [];
  let pendingUpdate = false;
  const [checkPromise, checkResolve] = newPromise();
  const checkShouldUpdate = next => {
    if (Object.is(state, next)) return Promise.resolve();
    hitSoy(state, next, debugTarget);
    state = next;
    const cbPromise = new Promise(res => {
      Promise.all([onSelfUpdate.map(cb => Promise.resolve(cb()))]).then(res);
    });
    if (pendingUpdate) return Promise.all([checkPromise, cbPromise]);
    pendingUpdate = true;
    queueMicrotask(() => {
      pendingUpdate = false;
      Promise.all([...updaters].map(doCheck => doCheck())).then(checkResolve);
    })
    return Promise.all([checkPromise, cbPromise]); // @todo 不知道太多promise会不会有性能问题
  }
  const selfInstance = {
    [GET_STATE]: () => state,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ON_UPDATE]: onSelfUpdate,
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
  const pathArr = [];
  const track = (...path) => {
    if (path.length === 0) throw ('path needed!');
    const ret = path.reduce((p, v) => p[v], getRoot());
    pathArr.push({ ret, path });
    return ret;
  }
  const task = (reducer => {
    return (...params) => {
      const work = draft => reducer(draft, ...params);
      const newState = getNewState(getRoot(), execSelect(), pathArr, work);
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
    if (!selector) return getRoot();
    pathArr.length = 0;
    const select = selector({ state: getRoot, track, task, memo });
    memoIndex.current = 0;
    return select;
  }
  const selected = execSelect();
  const renderRef = useRef(null);
  renderRef.current && renderRef.current();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const doCheck = () => {
    if (selector && !selectedChanged(selected, execSelect())) return Promise.resolve();
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
      const newState = getNewState(getRoot(), execSelect(), pathArr, work);
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
    [ASSIGN_MAP]: assignmentMap,
    [UPDATERS]: updaters } = conveyor;
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');
  let cancelled = false;
  cancelSignal && cancelSignal.then(() => {
    cancelled = true;
    cancelCallback && cancelCallback();
  });
  const pathArr = [];
  const track = (...path) => {
    if (path.length === 0) throw ('path needed!');
    const ret = path.reduce((p, v) => p[v], getRoot());
    pathArr.push({ ret, path });
    return ret;
  }
  let putPromise = null;
  const selectToPut = selector => {
    const execSelect = () => {
      if (!selector) return getRoot();
      pathArr.length = 0; // to keep pathArr info latest
      return selector(track);
    }
    execSelect();
    return {
      select: execSelect,
      put: work => {
        const newState = getNewState(getRoot(), execSelect(), pathArr, work);
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
    [ON_UPDATE]: onChildUpdate } = childConveyor;
  const {
    [GET_STATE]: getParentState,
    [CHECK_UPDATE]: parentCheckShouldUpdate,
    [ON_UPDATE]: onParentUpdate
  } = parentConveyor;
  const parentState = getParentState();
  if (Object.prototype.toString.call(parentState) !== '[object Object]')
    throw ('conveyor of primitive type could not assemble sub conveyor!')
  if (Object.keys(parentState).find(key => key === alias))
    throw ('existing key on target conveyor state!')
  parentState[alias] = getChildState();
  onChildUpdate.push(childValue => {
    return parentCheckShouldUpdate({ ...parentState, [alias]: childValue });
  });
  onParentUpdate.push(parentValue => {
    if (!Object.is(getChildState(), parentValue[alias])) {
      return childCheckShouldUpdate(parentValue[alias]);
    }
    return Promise.resolve();
  })
}