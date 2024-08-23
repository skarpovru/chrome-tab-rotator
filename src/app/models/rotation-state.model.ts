export class RotationState {
  /**
   * Indicates if the rotation is enabled.
   */
  isRotating: boolean = false;

  /**
   * A list of tab IDs that are rotating.
   */
  tabIds: number[] = [];

  constructor(init?: Partial<RotationState>) {
    Object.assign(this, init);
  }
}
