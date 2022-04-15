import { useEffect, useReducer, useCallback, useRef, useSyncExternalStore } from 'react';
import { produceNewState, hitSoy, isPlainObject, getMemoValue, newPromise, selectedChanged, steptify, subscribeAbort } from './utils';

const GET_STATE = Symbol();
const CHECK_UPDATE = Symbol();
const ON_CHECK = Symbol();
const UPDATERS = Symbol();
const ASSIGN_MAP = Symbol();

export const SELECT_AS_RET = Symbol();
export const TRACK_AS_RET = Symbol();
export const ROOT_AS_DRAFT = Symbol();

export const CUR_SELECTED = Symbol();

export const createInstance = state => {
  const updaters = new Set();
  const assignmentMap = new Map();
  const onCheckUpdate = [];
  const autorunQuene = [];
  const checkShouldUpdate = next => {
    if (Object.is(state, next)) return Promise.resolve();
    autorunQuene.forEach(debugInfo => hitSoy(state, next, debugInfo));
    state = next;
    const cbPromise = Promise.all([onCheckUpdate.map(cb => Promise.resolve(cb(state)))]);
    const doCheckPromise = Promise.all([...updaters].map(doCheck => doCheck()));
    return Promise.all([doCheckPromise, cbPromise]);
  }
  const selfInstance = {
    [GET_STATE]: () => state,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ON_CHECK]: onCheckUpdate,
    [UPDATERS]: updaters,
    [ASSIGN_MAP]: assignmentMap,
  };
  selfInstance.childUpdateCalled = 0;
  selfInstance.register = register.bind(null, selfInstance);
  selfInstance.dispatch = dispatch.bind(null, selfInstance);
  selfInstance.assemble = assemble.bind(null, selfInstance);
  selfInstance.autorun = (...debugInfo) => autorunQuene.push(debugInfo);
  return selfInstance;
}

/**
 * useConveyor hook
 */
export const useConveyor = (conveyor, selector, externalDeps) => {
  const { [GET_STATE]: getRoot, [CHECK_UPDATE]: checkShouldUpdate, [UPDATERS]: updaters } = conveyor;
  const select = (selectSet, remapped) => {
    if (!isPlainObject(remapped) || Object.keys(remapped).length === 0) {
      throw ('please pass a plain object and at least select a prop for selector!')
    }
    selectSet.add(remapped);
    return remapped;
  }
  const track = (trackSet, ...path) => {
    if (path.length === 0) throw ('path needed!');
    trackSet.add(path)
    return path;
  }
  const memo = (memoSet, computeFn, deps) => {
    const memoInfo = { computeFn, deps };
    memoSet.add(memoInfo);
    return memoInfo;
  }
  const task = (memoSet, producer, deps) => {
    const taskFn = (...params) => {
      const work = draft => producer(draft, ...params);
      const newState = produceNewState(getRoot(), execSelect(), work);
      checkShouldUpdate(newState);
    }
    return memo(memoSet, () => taskFn, deps ? deps : []);
  }

  const execSelect = () => {
    let mapping = new Map();
    if (!selector) {
      mapping.set(ROOT_AS_DRAFT, null);
      return { selected: getRoot(), draft: getRoot(), mapping };
    } else if (!isPlainObject(getRoot())) {
      throw ('only state of plain object deserves a selector for mapping!');
    }
    const selectSet = new Set();
    const trackSet = new Set();
    const memoSet = new Set();
    let selectorRet = selector({
      state: getRoot,
      select: select.bind(null, selectSet),
      track: track.bind(null, trackSet),
      memo: memo.bind(null, memoSet),
      task: task.bind(null, memoSet)
    });
    if (trackSet.has(selectorRet)) { // useMyData(({ track }) => track('count')); // tracked prop as selector ret
      const path = selectorRet;
      mapping.set(TRACK_AS_RET, path);
      const selected = path.reduce((p, v) => p[v], getRoot());
      return { selected, draft: selected, mapping };
    } else if (!selectSet.has(selectorRet)) {
      if (trackSet.size > 0 || memoSet.size > 0) {
        throw ('track, memo, task could only work with select, check whether select is used!');
      }
      mapping.set(ROOT_AS_DRAFT, null);
      return { selected: selectorRet, draft: getRoot(), mapping };
    }
    mapping.set(SELECT_AS_RET, selectorRet);
    let selected = {}, draft = {};
    Object.entries(selectorRet).forEach(([key, value]) => {
      if (trackSet.has(value)) {
        selected[key] = draft[key] = value.reduce((p, v) => p[v], getRoot());
      } else if (memoSet.has(value)) {
        const { computeFn, deps } = value;
        selected[key] = getMemoValue(key, memoCacheMap, computeFn, deps);
      } else {
        selected[key] = value;
      }
    });
    if (trackSet.size === 0) {
      draft = getRoot();
      mapping.set(ROOT_AS_DRAFT, null);
    }
    return { selected, draft, mapping };
  }

  const conveyorRef = useRef(conveyor);
  const { current: memoCacheMap } = useRef(new Map());
  if (conveyorRef.current !== conveyor) {
    conveyorRef.current = conveyor;
    memoCacheMap.clear(); // useRef will be kept despite even js file rebuild in dev?
  }

  const doCheckRef = useRef(null);
  doCheckRef.current?.doCheckResolve?.();
  doCheckRef.current = null;
  const selectedRef = useRef(null);
  const getSnapshot = () => {
    const selectInfo = execSelect();
    if (!selectedChanged(selectedRef.current, selectInfo)) return selectedRef.current;
    return selectedRef.current = selectInfo.selected;
  }

  return [
    useSyncExternalStore(useCallback(callback => {
      updaters.add(() => {
        if (doCheckRef.current?.doCheckPromise) return doCheckRef.current.doCheckPromise;
        const [doCheckPromise, doCheckResolve] = newPromise();
        doCheckRef.current = { doCheckPromise, doCheckResolve };
        callback();
        return doCheckPromise;
      });
      return () => updaters.delete(callback);
    }, []), getSnapshot),
    useCallback(work => {
      const newState = produceNewState(getRoot(), execSelect(), work);
      checkShouldUpdate(newState);
    }, [selectedRef.current])
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
export const dispatch = (conveyor, action, abortSignal) => {
  const { [GET_STATE]: getRoot,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ASSIGN_MAP]: assignmentMap } = conveyor;
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');

  const track = (trackSet, ...path) => {
    if (path.length === 0) throw ('path needed!');
    trackSet.add(path)
    return path;
  }

  const execSelect = selector => {
    const mapping = new Map();
    if (!selector) {
      mapping.set(ROOT_AS_DRAFT, null);
      return { selected: getRoot(), draft: getRoot(), mapping }
    };
    if (!isPlainObject(getRoot())) {
      throw ('only state of plain object deserves a selector for mapping!');
    }
    const trackSet = new Set();
    const selectorRet = selector(track.bind(null, trackSet));
    let selected = {};
    if (trackSet.has(selectorRet)) {
      const path = selectorRet;
      mapping.set(TRACK_AS_RET, path);
      selected = path.reduce((p, v) => p[v], getRoot());
    } else if (!isPlainObject(selectorRet) || Object.keys(selectorRet).length === 0) {
      throw ('please at least track a prop for selector!');
    } else {
      mapping.set(SELECT_AS_RET, selectorRet);
      Object.entries(selectorRet).forEach(([key, value]) => {
        if (trackSet.has(value)) {
          selected[key] = value.reduce((p, v) => p[v], getRoot());
          mapping.set(key, value);
        } else {
          throw ('only tracked prop is allowed in selectToPut for assignment!');
        }
      });
    }
    return { selected, draft: selected, mapping };
  }
  let putPromiseQuene = [];
  const selectToPut = selector => ({
    select: () => execSelect(selector).selected,
    put: work => {
      if (abortSignal?.aborted) throw ('please do not modify state after dispatch is aborted!');
      const newState = produceNewState(getRoot(), execSelect(selector), work);
      putPromiseQuene.push(checkShouldUpdate(newState));
    }
  });

  const step = promise => steptify(promise, abortSignal);
  const [dispatchPromise, dispatchResolve, dispatchReject] = newPromise();
  const done = res => {
    // putPromise is the latest prommise which created from put
    Promise.all(putPromiseQuene).then(() => dispatchResolve(res), dispatchReject);
  }
  if (abortSignal) subscribeAbort(abortSignal, dispatchReject);
  assignment(action, {
    state: getRoot,
    selectToPut,
    step,
    done,
    fail: dispatchReject,
    abortSignal,
    onAbort: cb => subscribeAbort(abortSignal, error => cb(error.message))
  });
  return dispatchPromise;
}

/**
 * assemble sub conveyor
 */
export const assemble = (parentConveyor, alias, childConveyor) => {
  const { [GET_STATE]: getChildState,
    [CHECK_UPDATE]: childCheckShouldUpdate,
    [ON_CHECK]: onChildCheck } = childConveyor;
  const { [GET_STATE]: getParentState,
    [CHECK_UPDATE]: parentCheckShouldUpdate,
    [ON_CHECK]: onParentCheck } = parentConveyor;
  const parentState = getParentState();
  if (!isPlainObject(parentState)) {
    throw ('conveyor of non-plain object type could not assemble sub conveyor!');
  }
  if (Object.keys(parentState).find(key => key === alias)) {
    throw ('existing key on target conveyor state!');
  }
  parentState[alias] = getChildState();
  onChildCheck.push(childNode => {
    if (parentConveyor.childUpdateCalled > 0) {
      parentConveyor.childUpdateCalled--;
      return Promise.resolve();
    }
    return parentCheckShouldUpdate({ ...parentState, [alias]: childNode });
  });
  onParentCheck.push(parentNode => {
    if (!Object.is(getChildState(), parentNode[alias])) {
      parentConveyor.childUpdateCalled++;
      return childCheckShouldUpdate(parentNode[alias]);
    }
    return Promise.resolve();
  });
}