# react-create-conveyor

A state-management solution for react in Provider-less mode
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

other nice solutions: jotai, zustand, recoil
which are designed to be more comprehensive enough to unify the world 🦸