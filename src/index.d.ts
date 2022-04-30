export function createConveyor<T>(state: T): [useConveyor: UseConveyor<T>, conveyor: Conveyor<T>]

export interface Conveyor<T> {
  register: <S extends string>(type: S, assignment: Assignment<T, S>) => void
  dispatch: (action: { type: string, payload?: any }, abortSignal?: AbortSignal) => Promise<unknown>
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

export type ModifyFunction<T> = (valueOrProducer: ValueOrProducer<T>) => void
type ValueOrProducer<T> = ((draft: T) => (void | T)) | T
// type ValueOrProducer<T> = true extends true ?  ((draft: T) => (void | T)) | T : never // to show detail tips in editor
type UseTask<T> = <Payload>(clientProducer: ClientProducer<T, Payload>, deps?: any[]) => (payload: Payload) => void
type ClientProducer<T, Payload> = (draft: T, payload?: Payload) => (void | T)

type EditableValue<T> = { EDITABLE: T }
type SelectValue<T> = { SELECTED: T }

/**
 * get key list includes only editable props
 */
type OnlyEditKeys<T> = {
  [K in keyof T]: T[K] extends EditableValue<unknown> ? K : never
}[keyof T]

type Selected<T> =
  T extends EditableValue<unknown>
  ? T['EDITABLE']
  : T extends SelectValue<unknown>
  ? {
    [K in keyof T['SELECTED']]: T['SELECTED'][K] extends EditableValue<unknown> ? T['SELECTED'][K]['EDITABLE'] : T['SELECTED'][K]
  }
  : T
type Draft<T> =
  T extends EditableValue<unknown>
  ? T['EDITABLE']
  : T extends SelectValue<unknown>
  ? {
    [K in OnlyEditKeys<T['SELECTED']>]: AbsoluteIndex<T['SELECTED'][K], 'EDITABLE'>
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

type EditFn<State> = <P extends KeyPath<State>>(...path: P) => EditableValue<PickValue<State, P>>

interface Operators<State> {
  select: <T>(selected: T) => SelectValue<T>
  edit: EditFn<State>
  state: State
  memo: <T>(computeFn: () => T, deps: any[]) => T
}

type SelectToPutRet<T> =
  T extends EditableValue<unknown>
  ? T['EDITABLE']
  : {
    [K in keyof T]: AbsoluteIndex<T[K], 'EDITABLE'>
  }

type Assignment<State, Type> = (action: { type: Type, payload: any }, assignmentOpts: {
  state: () => State
  selectToPut: <S>(selector: (edit: EditFn<State>) => S) => {
    select: () => SelectToPutRet<S>
    put: ModifyFunction<SelectToPutRet<S>>
  }
  step: <T>(promiseToCall: Promise<T>) => SteptifyObj<T>
  done: (res?: any) => void
  fail: (error?: any) => void
  abortSignal: AbortSignal
  onAbort: (callback: (reason: any) => void) => void
}) => void

type SteptifyObj<T> = {
  step: <N, E = never>(
    next?: (res: T) => N | PromiseLike<N> | undefined | null,
    error?: (error: any) => E | PromiseLike<E> | undefined | null
  ) => SteptifyObj<N | E>
  catch: (error: (error: unknown) => any) => SteptifyObj<unknown>
}

type DebugProps = [] | string[][]
type DebugEntry = (changed: { pre: any, next: any }[]) => void

type NormalTypes = number | string | boolean | symbol | bigint | null | undefined | any[] | readonly any[] | Function