# react-create-conveyor🛸

A state-management solution for react in Provider-less mode\
Based on immerJS\
Once pick the paths, do whatever you want ⚽\
✔ concurrent mode

## Quick Start

```bash
npm i react-create-conveyor
```

or
[![Edit Conveyor](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/react-create-conveyor-box-57zmv0)

### Table of Contents

- [Example](#example)
- [Advanced usage](#advanced-usage)
  - [Select](#select)
  - [useTask](#usetask)
- [Register Async Method](#register-async-method)
  - [Cancellation](#cancellation)
- [Modules](#modules)
- [Debug Entry](#debug-entry)
- [Typescript](#typescript)
  - [string path infer for getIn](#path-infer-for-getin)
- [Api Reference](#api-reference)
- [Drawback](#drawback)

## Example

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
// use getIn to pick value
const A = () => {
  const [toDos, setToDos] = useMyData(({ getIn }) => getIn('today', 'toDos')); // typescript helps analyze the path
  return <button onClick={() =>
    setToDos(draft => { // pass a producer -> setToDos(producer)
      draft.push('task2') // just push it, it will be immutable
    })
  }>A{toDos}</button>
}

// pass a value instead of producer function to setCount
const B = () => {
  const [count, setCount] = useMyData(({ getIn }) => getIn('count'));
  return <button onClick={() => setCount(count + 1)}>B{count}</button>
}
```

### select

```javascript
// use select to collect mappings
// use state to get values from root state
// use memo to cache calculation
const C = () => {
  const [dog, drawDog] = useMyData(({ select, getIn, state, memo }) =>
    select({ // 👈 select is recommended
      cName: getIn('dog', 'name'),
      cBreed: getIn('dog', 'breed'),
      fullName: state.dog.name + state.dog.breed,
      // memoName calculation is now dependent on dog.age
      memoName: memo(() => state.dog.name + state.dog.breed, [state.dog.age]),
    }));
  return <div>
    <button onClick={() => drawDog(draft => {
      draft.cName = 'da huang'; // just draw it, able to modify cName directly! 💥
      draft.cBreed += '🐕'; // next immutable state created by powerful immerJS
    })}>C full:{dog.fullName}</button>
    memo - depend on age: {dog.memoName}
  </div>
}
```

### Why to use select?

The select method is to mark the result as a recombination object and then it could be checked by shallow-equal. And with select, the object result reference is able to be cached.

### Why to use getIn?

The getIn method makes things easier. Once pick the paths, do whatever you want. For further info, refer to ts part [getIn](#path-infer-for-getin) and [useConveyor](#useconveyor).

```javascript
// getIn is not necessary
const D = () => {
  const [dogAge1, update1] = useMyData(({ state }) => state.dog.age); // no getIn
  const [dogAge2, update2] = useMyData(({ getIn }) => getIn('dog', 'age')); // with getIn
  return <div>
    D {dogAge1}
    {/* for no getIn, draft will be proxy of root state! */}
    <button onClick={() => update1(draft => { draft.dog.age++ })}>nogetIn dogAge+</button>
    {/* with getIn, there is no need to specify the paths repeatedly, just set age! */}
    <button onClick={() => update2(age => age + 1)}>dogAge+</button>
  </div>
}
```

### useTask

Define method in component to modify state. And it is allowed to pass dependencies, with useCallback built-in.

```javascript
// useTask to define method
const R = () => {
  const [dog, , useTask] = useMyData(({ getIn }) => getIn('dog'));
  const reset = useTask((dog, payload) => {
    dog.age = payload;
    dog.name = 'xiao bai';
    dog.breed = '🐶';
  }, [])
  return <button onClick={() => reset(2)}>reset DogAge {dog.age}</button>
}
```

## Register Async Method

Register methods outside component to modify state.

```javascript
export const [useMyDog, { register: myRegister, dispatch: myDispatch }] = createConveyor({
  owner: 'master',
  dog: {
    name: '加布兽(Gabumon)',
    breed: '🐶',
  }
})

// select & put which returned from selectToPut are safe in asynchronization
// action: { type, payload }
myRegister('EVOLUTION', (action, { selectToPut, state, done }) => {
  const { select: getDog, put: evolve } = selectToPut(getIn => getIn('dog'));
  console.log(`${state().owner}: ${getDog().name} ultimate evolution.`);
  setTimeout(() => { // to modify state in async callback
    evolve(draft => {
      draft.name = '钢铁加鲁鲁(Metal Garurumon)';
      draft.breed = '🐺';
    });
    done('=> 绝对冷冻气(Cocytus Breath)'); // try to resolve the promise return from dispatch
  }, 2000);
})

const E = () => {
  const [dog] = useMyDog(({ state }) => state.dog);
  return <button onClick={() =>
    myDispatch({ type: 'EVOLUTION' }).then(ability => console.log(dog.name + ability))
    // ability will be printed after all impacted components finish rerender!
    // so the promise returned from dispatch is safe
  }>E async 2s {dog.name} {dog.breed}</button>
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
  const [fNum, setCount] = useGlobal(({ getIn }) => getIn('assembledNumber'));
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
  console.log(JSON.stringify(changed)); // consle log: [{"pre":2,"next":3}]
})
```

## Typescript

It's recommended to use typescript to get exact type infer and error tips. But if you don't, you can also get type information from IDE such as vscode for its built-in type infer ability.\
 First to create a conveyor.

```javascript
const [useMyData] = createConveyor({ count: 0, today: { toDos: ['task1'] }})
```

### path infer for getIn

```javascript
useMyData(({ getIn }) => getIn('today', 'toDos')) // ✔
useMyData(({ getIn }) => getIn('today', 'toDoss')) // ❌
// typescript error for missing 'toDoss' will be like this:
// Type '["today", "toDoss"]' is not assignable to type 'readonly ["today", "toDos"]'.
//     Type at position 1 in source is not compatible with type at position 1 in target.
//       Type '"toDoss"' is not assignable to type '"toDos"'.ts(2345)
```

### useConveyor

useMyData is actually the hook useConveyor renamed by yourself
Only editable props will exist on draft, owe to getIn

```javascript
const [data, update] = useMyData(({ select, getIn, state }) => select({
  double: state.count * 2, // readonly
  thatIsCount: getIn('count'), // editable
  todayToDos: getIn('today', 'toDos') // editable
}))
// data type will be
// {
//   double: number;
//   thatIsCount: number;
//   todayToDos: string[];
// }

// update type will be
// ModifyFunction<{
//   thatIsCount: number;  -->  editable
//   todayToDos: string[];  -->  editable
// }>
```

todayToDos is only allowed to contain string element

```javascript
update(draft => {
  draft.todayToDos.push(123) // ❌ Argument of type 'number' is not assignable to parameter of type 'string'.ts(2345)
})
```

image that if someone delete **thatIsCount** in selector while update function refers to it somewhere, you will get typescript error below

```javascript
update(draft => {
  draft.thatIsCount++ // ❌ Property 'thatIsCount' does not exist on type '{ todayToDos: string[]; }'.ts(2339)
})
```

if you want to pass data and update to child component with type definition, the only way is to declare type for them as below

```javascript
type UpdateFn = ModifyFunction<{ // import ModifyFunction type
  thatIsCount: number;
  todayToDos: string[];
}>
```

## Api Reference

### basic

|**Method**|**Description**|
|-|-|
|createConveyor|create a conveyor|
|useConveyor|`const [useConveyor] = createConveyor({})` actually it can be renamed like `[useMyData]` [refer to useConveyor](#useconveyor)|
|getIn|`useConveyor(({ getIn }) => getIn('dog', 'age'))` [refer to getIn](#why-to-use-getin)|
|state|`useConveyor(({ state }) => state.dog.age)`|
|select|`useConveyor(({ select }) => select({ prop: value })` [refer to select](#select)|
|memo|`useConveyor(({ select, memo }) => select({ memoValue: memo() }))` [refer to memo](#select)|
|updateFn|`const [, setToDos] = useConveyor()` can be renamed [refer to setToDos](#advanced-usage)|
|useTask|`const [, , useTask] = useConveyor()` can be renamed [refer to useTask](#usetask)|

### dispatch

|**Method**|**Description**|
|-|-|
|register|`const [, { register }] = createConveyor({})` register method to modify state [refer to register](#register-async-method)|
|dispatch|`const [, { dispatch }] = createConveyor({})` [refer to dispatch](#register-async-method) when dispatch an action, the method registered will be called `dispatch: (action: { type: string, payload?: any }, abortSignal?: AbortSignal) => Promise<unknown>`|
|selectToPut|`register('ACTION_TYPE', (action, { selectToPut }) => {})` select the props which you want to modify [refer to async](#register-async-method)|
|select & put|`const { select, put } = selectToPut()` one for getValue, another for setValue. They are safe in async callback|
|state: Function|`register('ACTION_TYPE', (action, { state }) => {})` able to get latest version of state in async callback|
|done|`register('ACTION_TYPE', (action, { done }) => {})` resolve the promise returned from dispatch [refer to async](#register-async-method)|
|fail|`register('ACTION_TYPE', (action, { fail }) => {})` reject the promise returned from dispatch|
|step|`register('ACTION_TYPE', (action, { step }) => {})` make promise chain abortable [refer to cancel](#cancellation)|
|onAbort|`register('ACTION_TYPE', (action, { onAbort }) => {})` [refer to cancel](#cancellation)|
|abortSignal|`register('ACTION_TYPE', (action, { abortSignal }) => {})` [refer to cancel](#cancellation)|

### other

|**Method**|**Description**|
|-|-|
|assemble|`const [, { assemble }] = createConveyor({})` [refer to modules](#modules)|
|autorun|`const [, { autorun }] = createConveyor({})` [refer to debug](#debug-entry)|

## Drawback

Similar to react-redux, any state change will trigger notification to all connected components for checking. So please don't put all data into a single global conveyor if you could. But the good news is that react-create-conveyor dosen't rely on Context/Provider, it is very easy to create and use conveyors whenever and wherever! It's decentralized.

\
other nice solutions: mobx, jotai, zustand, recoil\
which are designed to be more comprehensive 🦸
