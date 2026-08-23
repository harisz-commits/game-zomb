/**
 * Globale Stellschrauben des Spielgefuehls. Alles hier ist bewusst flach und
 * benannt, damit Balancing ohne Codeaenderung moeglich bleibt.
 */

export const SIMULATION = {
  /** Fixed-Step-Frequenz der Simulation in Hz. */
  tickHz: 60,
  /** Mehr Nachhol-Steps pro Frame gibt es nicht (Spiral-of-Death-Schutz). */
  maxTicksPerFrame: 5,
} as const;

export const MOVEMENT = {
  /** Vorwaertsgeschwindigkeit der Armee in Metern pro Sekunde. */
  forwardSpeed: 9,
  /** Halbe Fahrbahnbreite in Metern; lateral bewegt sich die Armee in [-w, +w]. */
  laneHalfWidth: 4.2,
  /** Halbe Breite des befahrbaren Asphalts — bis hierher reicht die Geometrie. */
  roadHalfWidth: 5.8,
  /**
   * Breiter wird die Truppe nie, egal wie groß sie ist.
   *
   * Sie muss vollständig auf EINE Fahrbahnhälfte passen, sonst steht sie beim
   * Passieren eines Tors auf beiden Seiten und die Wahl ist optisch nicht mehr
   * ablesbar. Wächst die Armee darüber hinaus, wird sie länger statt breiter.
   */
  formationMaxHalfWidth: 2.6,
  /** Wie schnell die Formation der Eingabe folgt (Meter pro Sekunde). */
  lateralSpeed: 14,
  /** Glaettung der Eingabe: 0 = sofort, 1 = gar nicht. Pro Tick angewandt. */
  lateralSmoothing: 0.22,
  /** Bildschirmbreiten-Anteil fuer einen vollen Ausschlag beim Ziehen. */
  dragScreenTravel: 0.45,
} as const;

export const DISPLAY_CAPS = {
  /** Zielkorridor sichtbarer Alliierter. */
  alliesTarget: 100,
  alliesHard: 140,
  /** Zielkorridor sichtbarer Zombies. */
  enemiesTarget: 150,
  enemiesHard: 220,
} as const;

export const CAMERA = {
  /** Hoehe ueber der Armee. */
  height: 13.5,
  /** Abstand hinter der Armee. */
  distance: 15,
  /** Blickpunkt-Vorhalt: wie weit vor der Armee die Kamera zielt. */
  lookAhead: 9,
  /** Wie stark die Kamera der Lateralbewegung folgt (0 = gar nicht). */
  lateralFollow: 0.35,
  /** Weicher Nachlauf der Kamera pro Tick. */
  smoothing: 0.12,
  /** Je Meter Truppenlänge weicht die Kamera so viele Meter zurück. */
  depthPullback: 0.55,
  /** … und steigt dabei um so viele Meter pro Meter Truppenlänge. */
  depthLift: 0.22,
  /** Der Rückzug ist träger als die Seitwärtsbewegung: er soll wirken, nicht auffallen. */
  distanceSmoothing: 0.55,
  fovPortrait: 0.95,
  fovLandscape: 0.72,
} as const;

export const RENDER = {
  /** Obergrenze der Device-Pixel-Ratio — schuetzt schwache Mobilgeraete. */
  maxPixelRatio: 2,
  /** Sichtweite der Kamera in Metern. */
  farPlane: 220,
  /** Nebelbeginn/-ende, kaschiert das Ende der Geometrie. */
  fogStart: 90,
  fogEnd: 190,
} as const;

export const RUN = {
  /** Laenge eines Sektors in Metern (Richtwert, Sektoren duerfen abweichen). */
  sectorLengthMeters: 220,
  /** Sektoren pro Run in den endlichen Modi. */
  sectorsPerRun: { campaign: 5, survival: 6, endless: Number.POSITIVE_INFINITY },
  /** Nach so vielen Sektoren kommt im Endlosmodus ein Promotion-Checkpoint. */
  endlessCheckpointEvery: 3,
  /** Nach so vielen Sektoren kommt im Endlosmodus ein Elite/Boss-Encounter. */
  endlessBossEvery: 5,
} as const;

export const ARMY = {
  /** Startstaerke einer Run ohne Meta-Upgrades. */
  startCombatPower: 8,
  /** Unter diesem Wert gilt die Armee als vernichtet. */
  defeatCombatPower: 1,
} as const;
