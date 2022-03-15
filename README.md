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

// pass value to setCount instead of producer function
// but this is allowed only when selector return a tracked prop
const B = () => {
  const [count, setCount] = useMyData(({ track }) => track('count'));
  return <button onClick={() => setCount(count + 1)}>B{count}</button>
}

// use v, pass key & value to select a new mapping object
// use state to get values from root state
// use memo to cache calculation
// use task to define any assignment method
const C = () => {
  const [dog, drawDog] = useMyData(({ v, state, memo, task, track }) => {
    v('cName', track('dog', 'name'));
    v('cBreed', track('dog', 'breed'));
    v('cAge', track('dog', 'age'));
    // calculation is now dependent on dog.age
    v('fullName', state().dog.name + state().dog.breed);
    v('memoName', memo(() => state().dog.name + state().dog.breed, [state().dog.age]));
    v('myDisaptch', task((draft, { type, payload }) => { // redux style
      if (type === 'RESET') {
        draft.cAge = payload;
        draft.cName = 'xiao bai';
        draft.cBreed = '🐶';
      }
    }));
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

// track is not necessary
// if no prop tracked, root state passed to producer instead
const D = () => {
  const [{ dNum, upTen }, myUpdate] = useMyData(({ v, state, task }) => {
    v('dNum', state().count);
    v('upTen', task((draft) => { draft.count += 10 })) // just do it (use count but not dNum)
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
export const [useMyData, { register: myRegister, dispatch: myDispatch }] = createConveyor({
  dog: {
    age: 2
  }
})

// register an assignment for current conveyor
myRegister('UPDATE_DOG', (action, { selectToPut }) => {
  const { select, put, state } = selectToPut(track => track('dog', 'age'));
  const rootState = state(); // get anything from root state for preparation
  setTimeout(() => { // operation will be safe in async callback
    put(dogAge => dogAge * 2);
    put(select() * 10); // 20 fold increased
  }, 2000);
})

const E = () => {
  return <button onClick={() =>
    myDispatch({ type: 'UPDATE_DOG' })
  }>E async 2s</button>
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

### Resolved

```javascript
myRegister('UPDATE_DONE', (action, { selectToPut, done }) => {
  // developer need to determine when to execute done
  setTimeout(done, 3000); // whenever
})
myDispatch({ type: 'UPDATE_DONE' }).then(() => console.log('done'));
// myDispatch will become fulfilled when all impacted rerender is ok
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
