# react-create-conveyor

A state-management solution for react in Provider-less mode\
Based on immerJS\
Just get value,  and set value, it's all ⚽

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
// use track to do mapping
const A = () => {
  const [toDos, setToDos] = useMyData(({ track }) => track('today', 'toDos'));
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

// return ConveyorMap to collect mappings
// use state to get values from root state
// use memo to cache calculation
// use task to define any assignment method
const C = () => {
  const [dog, drawDog] = useMyData(({ ConveyorMap, track, state, memo, task }) => {
    const map = new ConveyorMap();
    map.set('cName', track('dog', 'name'));
    map.set('cBreed', track('dog', 'breed'));
    map.set('cAge', track('dog', 'age'));
    map.set('fullName', state().dog.name + state().dog.breed);
    // memoName calculation is now dependent on dog.age
    map.set('memoName', memo(() => state().dog.name + state().dog.breed, [state().dog.age]));
    map.set('myDisaptch', task((draft, { type, payload }) => { // redux style
      if (type === 'RESET') {
        draft.cAge = payload; // only tracked props will be added to draft!
        draft.cName = 'xiao bai'; // eg. fullName dose not exist in draft
        draft.cBreed = '🐶';
      }
    }));
    return map;
  });
  return <div>
    <button onClick={() => drawDog(draft => {
      draft.cName = 'da huang'; // just draw it in producer
      draft.cBreed += '🐕'; // next immutable state created by powerful immerJS
    })}>C {dog.fullName}</button>
    memo:{dog.memoName}
    <button onClick={() =>
      dog.myDisaptch({ type: 'RESET', payload: 2 })
    }>reset {dog.cAge}</button>
  </div>
}

// v is actually equal to use ConveyorMap, nothing special
const D = () => {
  const [{ dNum, upTen }, myUpdate] = useMyData(({ v, state, task }) => {
    v('dNum', state().count);
    v('dDogName', state().dog.name);
    v('upTen', task((draft) => { draft.count += 10 })) // use count but not dNum
    // track is not necessary
    // for no prop tracked, draft passed to producer will be proxy of root state
  });
  return <div>
    <button onClick={upTen}>D upTen{dNum}</button>
    <button onClick={() => myUpdate(draft => { draft.dog.age++ })}>
      noTrack dogAge+
    </button>
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

// register an assignment for current conveyor
myRegister('ULTIMATE_EVOLUTION', (action, { selectToPut, state, done }) => {
  const { put: grow } = selectToPut(track => track('dog', 'age'));
  const { select: getDog, put: evolve } = selectToPut(track => ({
    name: track('dog', 'name'),
    breed: track('dog', 'breed')
  }));
  const rootState = state(); // get anything from root state
  console.log(`${rootState.owner}:${getDog().name}究极进化`);
  setTimeout(() => {
    grow(age => age * 10);
    evolve(draft => {
      draft.name = '钢铁加鲁鲁(Metal Garurumon)';
      draft.breed = '🐺';
    });
    console.log(`${getDog().name}`);
    done('绝对冷冻气(Cocytus Breath)'); // resolve the promise return from dispatch
  }, 2000);
})

const E = () => {
  const [age] = useMyDog(({ state }) => state().dog.age);
  const [{ name, breed }] = useMyDog(({ state }) => ({
    name: state().dog.name,
    breed: state().dog.breed
  }));
  return <button onClick={() =>
    myDispatch({ type: 'ULTIMATE_EVOLUTION' }).then(ability => console.log(ability))
    // ability will be printed after all impacted rerender is ok
  }>E async 2s {age} {name} {breed}</button>
}
```

### Cancellation

```javascript
// cancelPromise and calcel
const [cancelPromise, cancel] = (() => {
  let cancel = null;
  return [new Promise(res => cancel = res), cancel];
})();

// use step to call api, and this is useful for cancellation
myRegister('UPDATE_CANCEL', (action, { selectToPut }) => {
  const { step } = selectToPut();
  const mockApi = new Promise(res => setTimeout(res, 1000));
  step(mockApi).then(() => { // do something after 1000ms });
})

myDispatch({ type: 'UPDATE_CANCEL' }, cancelPromise, cancelCallback);
setTimeout(cancel, 500); // cancel after 500ms

```

to some degree, cancelPromise is like AbortController to fetch\
what will happen when cancelPromise become fulfilled? 👇\
all of the pending step will stay at pending forever

```javascript
// for example 500ms < 1000ms
step(mockApi).then(() => { // will never be executed });
```

## Assemble sub conveyor

```javascript
const [useGlobal, { assemble: globalAssemble }] = createConveyor({}); // created a global conveyor
const [, subInstance] = createConveyor(666); // two weeks later created a sub conveyor

// three month later found the sub conveyor was accessed more frequently than you thought at the beginning
globalAssemble('assembledNumber', subInstance); // just assemble it, it's ok

const F = () => {
  const [fNum] = useGlobal(({ track }) => track('assembledNumber'));
  return <>F{fNum}</> // F666, get it in global conveyor
}
```

## Debug Entry

Let's see something useful

```javascript
// provide path of prop for the second param
// multiple props is allowed, as it is a 2D array
// just debug happily
// and with breaking point, to find out where changes happened exactly in function call stack
createConveyor({ dog: { age: 2 } }, [['dog', 'age']], changed => {
  console.log(changed); // consle log: [{"pre":2,"next":3}]
})
```

other nice solutions: jotai, zustand, recoil\
which are designed to be more comprehensive 🦸
