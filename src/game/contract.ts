export interface GameContract<State, Action, Seat, View> {
  init(): State;
  reduce(state: State, action: Action): State;
  seatsToAct(state: State): readonly Seat[];
  terminal(state: State): { ended: boolean; winner: Seat | null; draw: boolean };
  redact(state: State, seat: Seat | null): View;
}
