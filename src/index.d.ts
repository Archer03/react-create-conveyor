export function createConveyor<T>(state: T): [useConveyor: UseConveyor<T>, conveyor: Conveyor]

export interface Conveyor {
  register: () => void
  dispatch: () => void
  assemble: () => void
  autorun: () => void
}

type UseConveyor<T> = <K>(selector?: (operators: any) => K) => K extends unknown
  ? [selected: T, modifyFn: ModifyFunction<T>]
  : [selected: K, modifyFn: ModifyFunction<K>]

type ModifyFunction<T> = (producer: (draft: T) => void) => void