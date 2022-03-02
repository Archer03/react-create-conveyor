# react-create-conveyor

```javascript
import { createConveyor } from 'react-create-conveyor';

export const useCounter = createConveyor(0)
function Example () {
    const [count, setCount] = useCounter();
    // ...
}
```