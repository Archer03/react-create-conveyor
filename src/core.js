import { useEffect, useReducer, useCallback, useRef } from 'react';
import { getNewState, hitSoy, selectedChanged } from './utils';

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
  const checkShouldUpdate = next => {
    if (Object.is(state, next)) return;
    hitSoy(state, next, debugTarget);
    state = next;
    onSelfUpdate.forEach(callback => callback());
    if (pendingUpdate) return;
    pendingUpdate = true;
    queueMicrotask(() => {
      pendingUpdate = false;
      updaters.forEach(doCheck => doCheck());
    })
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
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const doCheck = () => {
    if (selector && !selectedChanged(selected, execSelect())) return;
    forceUpdate();
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
  const { [GET_STATE]: getRoot, [CHECK_UPDATE]: checkShouldUpdate, [ASSIGN_MAP]: assignmentMap } = conveyor;
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');
  const cancelled = false;
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
        checkShouldUpdate(newState);
      },
      state: getRoot,
      call: promise => new Promise((resolve, reject) => {
        promise.then(res => {
          if (cancelled) return new Promise();
          resolve(res);
        }).catch(err => reject(err));
      })
    }
  }
  let done = null;
  let fail = null;
  const ret = new Promise((res, rej) => {
    done = res;
    fail = rej;
  });
  assignment(action, { selectToPut, done, fail });
  return ret;
}

/**
 * assemble sub conveyor
 */
export const assemble = (parentConveyor, alias, childConveyor) => {
  const {
    [GET_STATE]: getChildState,
    [CHECK_UPDATE]: childCheckShouldUpdate,
    [ON_UPDATE]: onChildUpdate
  } = childConveyor;
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
    parentCheckShouldUpdate({ ...parentState, [alias]: childValue });
  });
  onParentUpdate.push(parentValue => {
    if (!Object.is(getChildState(), parentValue[alias])) {
      childCheckShouldUpdate(parentValue[alias]);
    }
  })
}