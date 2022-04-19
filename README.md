# react-create-conveyor🛸

A state-management solution for react in Provider-less mode\
Based on immerJS\
Just get value,  and set value, it's all ⚽\
It is now compatible with concurrent mode

```javascript
import { createConveyor } from 'react-create-conveyor';

export const useCounter = createConveyor(0);
function Example () {
    const [count, setCount] = useCounter();
    // see, we don't need <Context.Provider> ( ఠൠఠ )ﾉ
}
```

## Advanced usage

```javascript
export const [useMyData] = createConveyor({
  count: 0,
  dog: {
    name: 'xiao bai',
    breed: '🐶',
    age: 2,
  },
  today: {
    toDos: ['task1']
  }
})

// pass a selector -> useMyData(selector)
// use track to pick value
const A = () => {
  const [toDos, setToDos] = useMyData(({ track }) => track('today', 'toDos')); // typescript helps analyze the path
  return <button onClick={() =>
    setToDos(draft => { // pass producer function to setToDos
      draft.push('task2') // just push it
    })
  }>A{toDos}</button>
}

// pass a value instead of producer function to setCount
const B = () => {
  const [count, setCount] = useMyData(({ track }) => track('count'));
  return <button onClick={() => setCount(count + 1)}>B{count}</button>
}

// use select to collect mappings
// use state to get values from root state
// use memo to cache calculation
const C = () => {
  // why to use select?
  // select is to mark the result as a recombination object and then check it by shallow-equal
  // and with select, dog reference is able to be cached
  const [dog, drawDog, useTask] = useMyData(({ select, track, state, memo }) =>
    select({ // 👈 select is recommended
      cName: track('dog', 'name'),
      cBreed: track('dog', 'breed'),
      cAge: track('dog', 'age'),
      fullName: state.dog.name + state.dog.breed,
      // memoName calculation is now dependent on dog.age
      memoName: memo(() => state.dog.name + state.dog.breed, [state.dog.age]),
    }));

  // useTask to define method
  const reset = useTask((draft, payload) => {
    // only tracked props will be added to draft!
    // eg. fullName dose not exist in draft, but don't worry, typescript will even remind you!
    draft.cAge = payload;
    draft.cName = 'xiao bai';
    draft.cBreed = '🐶';
  }, []);
  return <div>
    <button onClick={() => drawDog(draft => {
      draft.cName = 'da huang'; // just draw it, able to modify cName directly! 💥
      draft.cBreed += '🐕'; // next immutable state created by powerful immerJS
    })}>C full:{dog.fullName}</button>
    <button onClick={() => reset(2)}>reset {dog.cAge}</button>
    memo:{dog.memoName}
  </div>
}

// track is not necessary
const D = () => {
  const [dogAge1, updateState] = useMyData(({ state }) => state.dog.age); // no prop tracked
  const [dogAge2, updateAge] = useMyData(({ track }) => track('dog', 'age')); // with prop tracked
  return <div>
    D {dogAge1}
    {/* for no prop tracked, draft will be proxy of root state */}
    <button onClick={() => updateState(draft => { draft.dog.age++ })}>noTrack dogAge+</button>
    <button onClick={() => updateAge(draft => ++draft)}>track dogAge+</button>
  </div>
}
```

## Register Assignment & Async Task

```javascript
export const [useMyDog, { register: myRegister, dispatch: myDispatch }] = createConveyor({
  owner: 'master',
  dog: {
    name: '加布兽(Gabumon)',
    breed: '🐶',
    age: 2
  }
})

// register an assignment
// select & put which returned from selectToPut are safe in asynchronization
myRegister('ULTIMATE_EVOLUTION', (action, { selectToPut, state, done }) => {
  const { put: grow } = selectToPut(track => track('dog', 'age'));
  const { select: getDog, put: evolve } = selectToPut(track => ({
    name: track('dog', 'name'),
    breed: track('dog', 'breed')
  }));
  const rootState = state(); // get anything from root state
  console.log(`${rootState.owner}: ${getDog().name} ultimate evolution.`);
  setTimeout(() => { // to modify state in async callback
    grow(age => age * 10);
    evolve(draft => {
      draft.name = '钢铁加鲁鲁(Metal Garurumon)';
      draft.breed = '🐺';
    });
    console.log(`${getDog().name}`);
    done('绝对冷冻气(Cocytus Breath)'); // try to resolve the promise return from dispatch
  }, 2000);
})

const E = () => {
  const [{ age, name, breed }] = useMyDog(({ state, select }) => select({
    age: state.dog.age,
    name: state.dog.name,
    breed: state.dog.breed
  }));
  return <button onClick={() =>
    myDispatch({ type: 'ULTIMATE_EVOLUTION' }).then(ability => console.log(ability))
    // ability will be printed after all impacted rerender is ok!
    // so the promise returned from dispatch is safe
  }>E async 2s {age} {name} {breed}</button>
}
```

### Cancellation

```javascript
// use step to make every step abortable
// the usage of step(next, error) is compeletely the same as promise.then(next, error)
myRegister('UPDATE_CANCEL', (action, { step, onAbort, abortSignal }) => {
  const mockApi = new Promise(res => setTimeout(res, 1000));
  step(mockApi) // pass a promise at first
    .step(() => console.log('mock api done.')) // done
    .step(() => new Promise(res => setTimeout(res, 1000)))
    .step(() => console.log('next step done.')) // won't be done, for 1500ms < 2000ms👇
  
  onAbort(reason => console.log('onAbort: ', reason)); // listen cancellation and unsubscribe automatically
  setTimeout(() => console.log(abortSignal.aborted), 3000); // check whether aborted
});

const abortCtrl = new AbortController(); // create an abortController, and pass its signal to dispatch
myDispatch({ type: 'UPDATE_CANCEL' }, abortCtrl.signal).catch(err => {
  if (err?.name === 'AbortError') console.log('cancel reason: ', err.message);
});
setTimeout(() => abortCtrl.abort('cancel assignment'), 1500); // cancel after 1500ms🚫
```

## Modules

```javascript
const [useGlobal, { assemble: globalAssemble }] = createConveyor({}); // created a global conveyor
const [, subInstance] = createConveyor(666); // two weeks later created a sub conveyor

// three month later found the sub conveyor was accessed more frequently than you thought at the beginning
globalAssemble('assembledNumber', subInstance); // just assemble it, it's ok

const F = () => {
  const [fNum, setCount] = useGlobal(({ track }) => track('assembledNumber'));
  return <button onClick={() => setCount(fNum + 1)}>F{fNum}</button> // F666, get it in global conveyor
}
```

## Debug Entry

Let's see something useful

```javascript
const [, { autorun }] = createConveyor({ dog: { age: 2 } });
// provide the prop path (multiple props is allowed, as it is a 2D array)
// just debug happily
// and with breaking point, to find out where changes happened clearly in function call stack
autorun([['dog', 'age']], changed => {
  console.log(changed); // consle log: [{"pre":2,"next":3}]
})
```

## Drawback

Similar to react-redux, any state change will trigger notification to all connected components for checking. So please don't put all data into a single global conveyor if you could. But the good news is that react-create-conveyor dosen't need Context/Provider, so it is very easy to create and use sub conveyors whenever and wherever!

\
other nice solutions: mobx, jotai, zustand, recoil\
which are designed to be more comprehensive 🦸
