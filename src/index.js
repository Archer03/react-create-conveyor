import { createInstance, useConveyor } from "./core";

// createConveyor
export const createConveyor = state => {
  const selfInstance = createInstance(state);
  // [hook, { register, dispatch, assemble, autorun }]
  return [
    selector => {
      return useConveyor(selfInstance, selector);
    },
    selfInstance
  ]
}