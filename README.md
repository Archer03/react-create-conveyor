# react-create-conveyor

A state-management solution for react in Provider-less mode\
Based on immerJS
Just get value,  and set value, it's all ⚽

```javascript
import { createConveyor } from 'react-create-conveyor';

export const useCounter = createConveyor(0);
function Example () {
    const [count, setCount] = useCounter();
    // see, we don't need <Context.Provider> ( ఠൠఠ )ﾉ
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

// use track to do mapping
// what returned from selector will be linked to the setToDos
const A = () => {
  const [toDos, setToDos] = useMyData(({ track }) => track('today', 'toDos'));
  return <button onClick={() =>
    setToDos(toDosDraft => { // pass producer function to setToDos
      toDosDraft.push('task2') // just push it
    })
  }>A{toDos}</button>
}

// pass value to setCount
// but this is allowed only when just one prop is tracked
const B = () => {
  const [count, setCount] = useMyData(({ track }) => track('count'));
  return <button onClick={() => setCount(count + 1)}>B{count}</button>
}

// track is not necessary
// if no track applied, root state received in producer instead
// selector won't be linked to producer
const C = () => {
  const [{ cNum, upTen }, myUpdate] = useMyData(({ state, task }) => ({
    cNum: state.count,
    upTen: task((draft) => { draft.count += 10 }) // just do it
  }));
  return <div>
    <button onClick={upTen}>C upTen{cNum}</button>
    <button onClick={() => myUpdate(draft => { draft.dog.age++ })}>
      noTrack dogAge+
    </button>
  </div>
}

// use memo to cache calculation
// use task to define any plan method, maybe like reducer
const D = () => {
  const [dog, drawDog] = useMyData(({ state, track, task, memo }) => ({
    name: track('dog', 'name'),
    age: track('dog', 'age'),
    fullName: state.dog.name + state.dog.age,
    // calculation is now dependent on state.count
    memoName: memo(() => state.dog.name + state.dog.age, [state.count]), 
    myDisptch: task((draft, { type, payload }) => { // redux style
      if (type === 'RESET') {
        draft.age = payload;
        draft.name = 'xiao bai 🐶';
      }
    })
  }));
  return <div>
    <button onClick={() => drawDog(draftDog => {
      draftDog.name = 'da huang 🐕'; // just draw it in producer
      draftDog.age++; // next immutable state will be created by powerful immerJS
    })}>E {dog.fullName}</button>
    memo:{dog.memoName}
    <button onClick={() => dog.myDisptch({ type: 'RESET', payload: 2 })}>reset</button>
  </div>
}
```

other nice solutions: jotai, zustand, recoil\
which are designed to be more comprehensive 🦸