export function createConveyor<T>(state: T): [useConveyor: UseConveyor<T>, conveyor: Conveyor<T>]

export interface Conveyor<T> {
  register: <S extends string>(type: S, assignment: Assignment<T, S>) => void
  dispatch: (action: { type: string, payload: any }) => Promise<unknown>
  assemble: (key: string, subConveyor: Conveyor<unknown>) => void
  autorun: (debugProps: DebugProps, debugEntry: DebugEntry) => void
}

/**
 * overload
 */
type UseConveyor<State> = {
  (): [selected: State, modifyFn: ModifyFunction<State>, useTask: UseTask<State>]
  <SelectorRet>(selector: (operators: Operators<State>) => SelectorRet): [
    selected: Selected<SelectorRet>,
    modifyFn: ModifyFunction<keyof Draft<SelectorRet> extends never ? State : Draft<SelectorRet>>,
    useTask: UseTask<keyof Draft<SelectorRet> extends never ? State : Draft<SelectorRet>>
  ]
}

type ModifyFunction<T> = (valueOrProducer: ValueOrProducer<T>) => void
type ValueOrProducer<T> = ((draft: T) => (void | T)) | T
// type ValueOrProducer<T> = true extends true ?  ((draft: T) => (void | T)) | T : never // to show detail tips in editor
type UseTask<T> = <Payload>(clientProducer: ClientProducer<T, Payload>, deps?: any[]) => (payload: Payload) => void
type ClientProducer<T, Payload> = (draft: T, payload?: Payload) => (void | T)

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
 * to avoid typescript error, when i confirm that this is absolute correct to expect T[K]
 */
type AbsoluteIndex<T, K> = K extends keyof T ? T[K] : never

type KeyPath<D> = readonly [] | (
  { [Key in keyof D]: readonly [Key] | KeyPathInfinite<[Key], D[Key]> }[keyof D]
)
type KeyPathInfinite<Pres extends any[], D> = D extends NormalTypes ? never :
  { [Key in keyof D]: readonly [...Pres, Key] | KeyPathInfinite<[...Pres, Key], D[Key]> }[keyof D]

type PickValue<State, PathArr> = PathArr extends readonly [infer First, ...infer Rest]
  ? Rest extends [] ? AbsoluteIndex<State, First> : PickValue<AbsoluteIndex<State, First>, Rest>
  : never

interface Operators<State> {
  select: <T>(selected: T) => SelectValue<T>
  track: <P extends KeyPath<State>>(...path: P) => TrackedValue<PickValue<State, P>>
  state: State
  memo: <T>(computeFn: () => T, deps: any[]) => T
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
type DebugEntry = (changed: { pre: any, next: any }[]) => void

type NormalTypes = number | string | boolean | symbol | bigint | null | undefined | any[] | readonly any[] | Function