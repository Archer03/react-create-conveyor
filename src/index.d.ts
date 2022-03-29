export function createConveyor<T>(state: T): [useConveyor: UseConveyor<T>, conveyor: Conveyor]

export interface Conveyor {
  register: () => void
  dispatch: () => void
  assemble: () => void
  autorun: () => void
}

type UseConveyor<T> = <K>(selector?: (operators: any) => K) => K extends undefined
  ? [selected: T, modifyFn: ModifyFunction<T>]
  : [selected: K, modifyFn: ModifyFunction<Draft<K>>]

type ModifyFunction<T> = (producer: (draft: T) => void) => void

/**
 * usage:
 * ({ track }) => ({ dogAge: track('dog', 'age') as TrackedValue<number> })
 */
export type TrackedValue<T> = { TRACKED: T }

/**
 * get key list which for tracked props
 */
type TrackKeys<T> = {
  [K in keyof T]: T[K] extends TrackedValue<unknown> ? K : never
}[keyof T]

type Draft<T> = {
  [K in TrackKeys<T>]: T[K] extends TrackedValue<unknown> ? T[K]['TRACKED'] : never
}