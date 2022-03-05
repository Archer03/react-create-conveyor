# react-create-conveyor

A state-management solution for react in Provider-less mode\
Just get value,  and set value, it's all ⚽
```javascript
import { createConveyor } from 'react-create-conveyor';

export const useCounter = createConveyor(0);
function Example () {
    const [count, setCount] = useCounter();
    // see, we don't need <Context.Provider> ( ఠൠఠ )ﾉ
    // be able to share data and subscribe changes
}
```

Advanced usage
```javascript
const useMyData = createConveyor({
  count: 0,
  dog: {
    name: 'xiao bai 🐶',
    age: 2,
  },
  today: {
    toDos: ['task1']
  }
})

// use track to map the relationship
const A = () => {
  const [toDos, setToDos] = useMyData(({ track }) => track('today', 'toDos')); // array type
  return <button onClick={() =>
    setToDos(toDosDraft => {
      toDosDraft.push('task2') // just push it
    })
  }>A{toDos}</button>
}

const B = () => {
  const [count, setCount] = useMyData(({ track }) => track('count')); // primitives type
  return <button onClick={() => setCount(count + 1)}>B{count}</button> // just set it
}

// track is not necessary
// if no track applied, use root state directly
// use track only when you want to modify value by new relationship
const C = () => {
  const [{ cNum, upTen }, myUpdate] = useMyData(({ state, task }) => ({
    cNum: state.count,
    upTen: task((state) => { state.count += 10 })
  }));
  return <div>
    <button onClick={upTen}>C upTen{cNum}</button>
    <button onClick={() => myUpdate(state => { state.dog.age++ })}>noTrack dogAge++</button>
  </div>
}

// use memo to cache calculation
// use task to define any method, maybe like reducer
const D = () => {
  const [dog, drawDog] = useMyData(({ state, track, task, memo }) => ({
    name: track('dog', 'name'),
    age: track('dog', 'age'),
    fullName: state.dog.name + state.dog.age,
    memoFullName: memo(() => state.dog.name + state.dog.age, [state.count]), // update only when count changed
    myDisptch: task((draft, { type, payload }) => { // redux style
      if (type === 'RESET') {
        draft.age = payload;
        draft.name = 'xiao bai 🐶';
      }
    })
  }));
  return <><div>
    <button onClick={() => drawDog(draftDog => {
      draftDog.name = 'da huang 🐕';
      draftDog.age++;
    })}>E draw: {dog.fullName}</button> memo:{dog.memoFullName}
    <button onClick={() => dog.myDisptch({ type: 'RESET', payload: 2 })}>reset</button></div>
  </>
}
```

other nice solutions: jotai, zustand, recoil\
which are designed to be more comprehensive 🦸