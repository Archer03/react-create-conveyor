export function createConveyor<T>(state: T): [useConveyor: UseConveyor<T>, conveyor: Conveyor<T>]

export interface Conveyor<T> {
  register: <S extends string>(type: S, assignment: Assignment<T, S>) => void
  dispatch: (action: { type: string, payload: any }) => Promise<unknown>
  assemble: (key: string, subConveyor: Conveyor<unknown>) => void
  autorun: (debugProps: DebugProps, debugEntry: DebugEntry) => void
}

type UseConveyor<State> = <SelectorRet>(selector?: (operators: Operators<State>) => SelectorRet) => SelectorRet extends undefined
  ? [selected: State, modifyFn: ModifyFunction<State>]
  : [selected: Selected<SelectorRet>, modifyFn: ModifyFunction<keyof Draft<SelectorRet> extends never ? State : Draft<SelectorRet>>]

type ModifyFunction<T> = (valueOrProducer: ValueOrProducer<T>) => void
type ValueOrProducer<T> = ((draft: T) => (void | T)) | T
// type ValueOrProducer<T> = true extends true ?  ((draft: T) => (void | T)) | T : never // to show detail tips in editor

type TrackedValue<T> = { TRACKED: T }
type SelectValue<T> = { SELECTED: T }

/**
 * get key list includes only tracked props
 */
type OnlyTrackKeys<T> = {
  [K in keyof T]: T[K] extends TrackedValue<unknown> ? K : never
}[keyof T]

type Selected<T> =
  T extends TrackedValue<unknown>
  ? T['TRACKED']
  : T extends SelectValue<unknown>
  ? {
    [K in keyof T['SELECTED']]: T['SELECTED'][K] extends TrackedValue<unknown> ? T['SELECTED'][K]['TRACKED'] : T['SELECTED'][K]
  }
  : T
type Draft<T> =
  T extends TrackedValue<unknown>
  ? T['TRACKED']
  : T extends SelectValue<unknown>
  ? {
    [K in OnlyTrackKeys<T['SELECTED']>]: AbsoluteIndex<T['SELECTED'][K], 'TRACKED'>
  }
  : T

/**
 * to avoid typescript error, when i confirm that it is absolute correct to expect T[K]
 */
type AbsoluteIndex<T, K> = K extends keyof T ? T[K] : never

/**
 * usage: ({ track }) => ({ dogAge: track<number>('dog', 'age')
 */
interface Operators<State> {
  select: <T>(selected: T) => SelectValue<T>
  track: <T>(...path: string[]) => TrackedValue<T>
  state: () => State
  memo: <T>(computeFn: () => T, deps: any[]) => T
  task: (producer: ModifyFunction<unknown>, deps?: any[]) => void // the biggest problem is i cannot get selected type here, so task will lost type
}

type Assignment<State, T> = (action: { type: T, payload: any }, assignmentOpts: {
  state: () => State
  selectToPut // todo
  step: <T>(promiseToCall: Promise<T>) => SteptifyObj<T>
  done: (res: any) => void
  fail: (error: any) => void
  abortSignal: AbortSignal
  onAbort: (callback: (reason: any) => void) => void
}) => void
type SteptifyObj<T> = {
  step: (next: (res: unknown) => any, error: (error: unknown) => any) => SteptifyObj<unknown>
  catch: (error: (error: unknown) => any) => SteptifyObj<unknown>
}

type DebugProps = [] | string[][]
type DebugEntry = (changed: { pre: any, next: any }) => void