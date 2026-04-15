export interface HydraScene {
  readonly name: string;
  /** Patches the global Hydra chain. Reactive params should close over
   *  bus getters so values update every frame without re-patching. */
  setup(h: any): void;
}
