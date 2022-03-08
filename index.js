import { useEffect, useReducer, useCallback, useRef } from 'react';
import produce from 'immer';

const GET_STATE = Symbol();
const SET_STATE = Symbol();
const CHECK_UPDATE = Symbol();
const ON_UPDATE = Symbol();

export const createConveyor = (state, strictMode) => {
  const updaters = new Set();
  const assignmentMap = new Map();
  const getRoot = () => state;
  const setRoot = next => state = next;
  const onSelfUpdate = [];
  let pendingUpdate = false;
  const checkShouldUpdate = next => {
    if (Object.is(state, next)) return;
    setRoot(next);
    onSelfUpdate.forEach(callback => callback());
    if (pendingUpdate) return;
    pendingUpdate = true;
    queueMicrotask(() => {
      pendingUpdate = false;
      updaters.forEach(doCheck => doCheck());
    })
  }
  const selfInstance = {
    [GET_STATE]: getRoot,
    [SET_STATE]: setRoot,
    [CHECK_UPDATE]: checkShouldUpdate,
    [ON_UPDATE]: onSelfUpdate
  };
  // [hook, register, dispatch, assemble, instance]
  return [
    selector => {
      const pathArr = [];
      const track = (...path) => {
        if (path.length === 0) throw ('path needed!');
        const ret = path.reduce((p, v) => p[v], state);
        pathArr.push({ ret, path });
        return ret;
      }
      const task = (reducer => {
        return strictMode ?
          () => { throw ('under strict mode, better to register global action.') } :
          (...params) => {
            const work = draft => reducer(draft, ...params);
            const newState = getNewState(state, execSelect(), pathArr, work);
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
        if (!selector) return state;
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
        strictMode ?
          () => { throw ('under strict mode, better to register global action.') } :
          useCallback(work => {
            const newState = getNewState(state, execSelect(), pathArr, work);
            checkShouldUpdate(newState);
          }, [selector])
      ];
    },
    (...params) => {
      register(...params, assignmentMap);
    },
    action => {
      dispatch(action, assignmentMap, getRoot, checkShouldUpdate);
    },
    (alias, childConveyor) => {
      assemble(alias, childConveyor, selfInstance);
    },
    selfInstance
  ]
}

/**
 * compare changes for selected
 */
const selectedChanged = (preSelected, nextSelected) => {
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
const syncChangesToRootByPath = (curRoot, selected, nextSlice, pathArr) => {
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
 * create new root state
 */
const getNewState = (curRoot, selected, pathArr, work) => {
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
 * register assignment by unique type
 */
const register = (type, assignment, assignmentMap) => {
  if (assignmentMap.get(type)) throw ('duplicate type added!');
  assignmentMap.set(type, assignment);
}

/**
 * dispatch an assignment to do
 */
const dispatch = (action, assignmentMap, getRoot, checkShouldUpdate) => {
  const assignment = assignmentMap.get(action.type);
  if (!assignment) throw ('no type registered!');
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
      state: getRoot
    }
  }
  assignment(action, selectToPut);
}

/**
 * assemble sub conveyor
 */
const assemble = (alias, childConveyor, parentConveyor) => {
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