import { useCallback, useRef } from 'react';
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector"
import { produceNewState, hitSoy, isPlainObject, getMemoValue, newPromise, selectedChanged, steptify, subscribeAbort } from './utils';

const GET_STATE = Symbol();
const CHECK_UPDATE = Symbol();
const ON_CHECK = Symbol();
const UPDATERS = Symbol();
const ASSIGN_MAP = Symbol();

export const SELECT_AS_RET = Symbol();
export const TRACK_AS_RET = Symbol();
export const ROOT_AS_DRAFT = Symbol();

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
export const useConveyor = (conveyor, selector) => {
  const { [GET_STATE]: getRoot, [CHECK_UPDATE]: checkShouldUpdate, [UPDATERS]: updaters } = conveyor;

  const conveyorRef = useRef(conveyor);
  const { current: memoCacheMap } = useRef(new Map());
  if (conveyorRef.current !== conveyor) {
    conveyorRef.current = conveyor;
    memoCacheMap.clear(); // useRef will be kept despite even js file rebuild in dev?
  }

  // selector reference always changes, it will be a disaster if subscribe it
  // doCheck and useTask just own the first execSelect reference
  const execSelect = getSelectThunk(selector, getRoot, memoCacheMap);

  const doCheckRef = useRef(null);
  doCheckRef.current?.doCheckResolve?.(); // to detect whether render is triggered
  doCheckRef.current = null;

  const subscribe = useCallback(notify => {
    const doCheck = () => {
      // if render is pending, then abandon notifying
      // it is safe because every render will get latest selection, and after that we are able to notify again
      // return promise for checkShouldUpdate, which helps to know when all impacted components finish rerender
      if (doCheckRef.current?.doCheckPromise) return doCheckRef.current.doCheckPromise;
      if (!selectedChanged(selectedRef.current, execSelect())) return Promise.resolve();
      const [doCheckPromise, doCheckResolve] = newPromise();
      doCheckRef.current = { doCheckPromise, doCheckResolve };
      notify();
      return doCheckPromise;
    }
    updaters.add(doCheck);
    return () => updaters.delete(doCheck);
  }, []);
  const equalFn = (pre, cur) => !selectedChanged(pre.selected, cur);
  // every render will cause execSelect, and selectInfo is cached until the custom selection changed
  const selectInfo = useSyncExternalStoreWithSelector(subscribe, getRoot, null, execSelect, equalFn);
  const selectedRef = useRef(null); // take care that selectInfo.draft version maybe too old while selected is correct
  selectedRef.current = selectInfo.selected;

  const useTask = (clientProducer, deps) => {
    const taskFn = (...params) => {
      const work = draft => clientProducer(draft, ...params);
      const newState = produceNewState(getRoot(), execSelect(), work);
      checkShouldUpdate(newState);
    }
    return useCallback(taskFn, deps);
  }

  return [
    selectInfo.selected,
    useCallback(work => {
      const newState = produceNewState(getRoot(), execSelect(), work);
      checkShouldUpdate(newState);
    }, []),
    useTask
  ];
}

const operatorsForSelector = {
  select: (selectSet, remapped) => {
    if (!isPlainObject(remapped) || Object.keys(remapped).length === 0) {
      throw ('please pass a plain object and at least select a prop for selector!')
    }
    selectSet.add(remapped);
    return remapped;
  },
  track: (trackSet, ...path) => {
    if (path.length === 0) throw ('path needed!');
    trackSet.add(path)
    return path;
  },
  memo: (memoSet, computeFn, deps) => {
    const memoInfo = { computeFn, deps };
    memoSet.add(memoInfo);
    return memoInfo;
  }
}

/**
 * return a select function help to get the latest custom selection and draft target
 * only the tracked key will exist in draft
 * @returns { selected, draft, mapping }
 */
const getSelectThunk = (selector, getRoot, memoCacheMap) => () => {
  const { select, track, memo } = operatorsForSelector;
  let mapping = new Map();
  if (!selector) {
    mapping.set(ROOT_AS_DRAFT, null);
    return { selected: getRoot(), draft: getRoot(), mapping };
  }
  const selectSet = new Set();
  const trackSet = new Set();
  const memoSet = new Set();
  const selectorRet = selector({
    state: getRoot(),
    select: select.bind(null, selectSet),
    track: track.bind(null, trackSet),
    memo: memo.bind(null, memoSet),
  });
  if (trackSet.has(selectorRet)) { // useMyData(({ track }) => track('count')); // tracked prop as selector ret
    const path = selectorRet;
    mapping.set(TRACK_AS_RET, path);
    const selected = path.reduce((p, v) => p[v], getRoot());
    return { selected, draft: selected, mapping };
  } else if (!selectSet.has(selectorRet)) {
    if (trackSet.size || memoSet.size) {
      throw ('track and memo could only work with select, check whether select is used!');
    }
    mapping.set(ROOT_AS_DRAFT, null);
    return { selected: selectorRet, draft: getRoot(), mapping };
  }

  // if selectorRet is the value return from select operator
  // then mark it as a recombination object
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

  const getLatestSelection = selector => {
    const mapping = new Map();
    if (!selector) {
      mapping.set(ROOT_AS_DRAFT, null);
      return { selected: getRoot(), draft: getRoot(), mapping }
    };
    if (!isPlainObject(getRoot())) {
      throw ('only state of plain object deserves a selector for mapping!');
    }
    const trackSet = new Set();
    // only track is allowed for selectToPut
    const selectorRet = selector(operatorsForSelector.track.bind(null, trackSet));
    let selected = {};
    if (trackSet.has(selectorRet)) {
      const path = selectorRet;
      mapping.set(TRACK_AS_RET, path);
      selected = path.reduce((p, v) => p[v], getRoot());
    } else if (!isPlainObject(selectorRet) || Object.keys(selectorRet).length === 0) {
      throw ('please at least track a prop for selector!');
    }
    mapping.set(SELECT_AS_RET, selectorRet);
    Object.entries(selectorRet).forEach(([key, value]) => {
      if (trackSet.has(value)) {
        selected[key] = value.reduce((p, v) => p[v], getRoot());
        mapping.set(key, value);
      } else {
        throw ('only tracked prop is allowed in selectToPut for assignment!');
      }
    });
    return { selected, draft: selected, mapping };
  }
  let putPromiseQuene = [];
  const selectToPut = selector => ({
    select: () => getLatestSelection(selector).selected,
    put: work => {
      if (abortSignal?.aborted) throw ('please do not modify state after dispatch is aborted!');
      const newState = produceNewState(getRoot(), getLatestSelection(selector), work);
      putPromiseQuene.push(checkShouldUpdate(newState));
    }
  });

  const step = promise => steptify(promise, abortSignal);
  const [dispatchPromise, dispatchResolve, dispatchReject] = newPromise();
  const done = res => {
    // make sure all impacted components finish rerender
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