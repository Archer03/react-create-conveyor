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
// what returned from selector will be linked to setToDos
const A = () => {
  const [toDos, setToDos] = useMyData(({ track }) => track('today', 'toDos'));
  return <button onClick={() =>
    setToDos(toDosDraft => { // pass producer function to setToDos
      toDosDraft.push('task2') // just push it
    })
  }>A{toDos}</button>
}

// pass value to setCount instead of producer function
// but this is allowed only when single prop tracked
const B = () => {
  const [count, setCount] = useMyData(({ track }) => track('count'));
  return <button onClick={() => setCount(count + 1)}>B{count}</button>
}

// track is not necessary
// if no prop tracked, root state passed to producer instead
const C = () => {
  const [{ cNum, upTen }, myUpdate] = useMyData(({ state, task }) => ({
    cNum: state().count,
    upTen: task((draft) => { draft.count += 10 }) // just do it (use count but not cNum)
  }));
  return <div>
    <button onClick={upTen}>C upTen{cNum}</button>
    <button onClick={() => myUpdate(draft => { draft.dog.age++ })}>
      noTrack dogAge+
    </button>
  </div>
}

// use $draft if multiple props to modify
// use memo to cache calculation
// use task to define any assignment method
const D = () => {
  const [dog, drawDog] = useMyData(({ state, track, task, memo }) => ({
    $draft: {
      dName: track('dog', 'name'),
      dBreed: track('dog', 'breed'),
      dAge: track('dog', 'age'),
    },
    fullName: state().dog.name + state().dog.breed,
    // calculation is now dependent on dog.age
    memoName: memo(() => state().dog.name + state().dog.breed, [state().dog.age]),
    myDisptch: task((draft, { type, payload }) => { // redux style
      if (type === 'RESET') {
        draft.dAge = payload;
        draft.dName = 'xiao bai';
        draft.dBreed = '🐶';
      }
    })
  }));
  return <div>
    <button onClick={() => drawDog(draft => {
      draft.dName = 'da huang'; // just draw it in producer
      draft.dBreed += '🐕'; // next immutable state created by powerful immerJS
    })}>D {dog.fullName}</button>
    memo:{dog.memoName}
    <button onClick={() => 
      dog.myDisptch({ type: 'RESET', payload: 2 })
    }>reset {dog.dAge}</button>
  </div>
}
```

## Register Assignment & Async Task

```javascript
export const [useMyData, { register: myRegister, dispatch: myDispatch }] = createConveyor({
  dog: {
    age: 2
  }
})

// register an assignment for current conveyor
// select, put and state will be safe at async callback
// you could also pass producer function or value to 'put', same as advanced usage above
myRegister('UPDATE_DOG', (action, { selectToPut }) => {
  const { select, put, state } = selectToPut(track => ({
    dogAge: track('dog', 'age'),
  }));
  const rootState = state(); // get anything from root state for preparation
  setTimeout(() => {
    put(draft => { draft.dogAge *= 2 }); // commit state changes whenever you want
    put(select().dogAge * 10); // 20 fold increased
  }, 2000);
})

const E = () => {
  return <button onClick={() =>
    myDispatch({ type: 'UPDATE_DOG' })
  }>E async 2s</button>
}
```

### Assignment Cancellation

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
  step(mockApi).then(() => { // do something });
})

myDispatch({ type: 'UPDATE_CANCEL' }, cancelPromise, cancelCallback);
setTimeout(cancel, 500); // cancelPromise would become fulfilled after 500ms

```

to some degree, cancelPromise is like AbortController to fetch\
what will happen when cancelPromise become fulfilled? 👇\
all of the pending step will stay at pending forever

```javascript
// for example 500ms < 1000ms, so cancellation is earlier than mockApi
step(mockApi).then(() => { // will never be executed });
```

### Assignment resolved

```javascript
myRegister('UPDATE_DONE', (action, { selectToPut, done }) => {
  // developer need to determine when to execute done
  setTimeout(done, 3000); // whenever
})
myDispatch({ type: 'UPDATE_DONE' }).then(() => console.log('done'));

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
