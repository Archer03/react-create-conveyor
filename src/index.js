import { createInstance, useConveyor } from "./core";

// createConveyor
export default (state, ...debugTarget) => {
  const selfInstance = createInstance(state, debugTarget);
  // [hook, { register, dispatch, assemble }]
  return [
    selector => {
      return useConveyor(selector, selfInstance);
    },
    selfInstance
  ]
}