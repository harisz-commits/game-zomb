/**
 * Kampf-Abstimmung.
 *
 * ## Warum Gegner relativ zur Armee skalieren
 *
 * Die Kampfkraft wächst über zwölf Stufen exponentiell — von 8 auf über eine
 * Milliarde. Feste Gegnerwerte könnten dem unmöglich folgen: sie wären in
 * Sekunde dreißig tödlich und in Minute drei nicht mehr messbar. Man müsste
 * eine Gegnerkurve über zwölf Zehnerpotenzen von Hand pflegen, die exakt zur
 * Torkurve passt — und jede Balance-Änderung an den Toren würde sie brechen.
 *
 * Deshalb bekommt eine Welle ihr Lebenspunkte-Budget als ANTEIL der aktuellen
 * Armeestärke. Ein Kampf kostet damit in jeder Spielphase ungefähr gleich
 * viel, und die Zahlen bleiben von selbst im Rahmen.
 *
 * Der Preis ist ein Gummiband: Wer sehr stark ist, trifft auf sehr starke
 * Gegner. Das ist hier gewollt — die Machtfantasie steckt im Wachstum der
 * eigenen Zahl und in der Menge niedergemähter Zombies, nicht darin, dass
 * Widerstand irgendwann ausbleibt.
 */

export const COMBAT = {
  /** Schaden pro Sekunde je Punkt Kampfkraft. */
  dpsPerPower: 0.45,
  /**
   * Ab dieser Entfernung vor der Armee wird gefeuert (Meter).
   *
   * Bewusst kurz. Mit großer Reichweite schmolzen die Wellen am Nebelrand
   * dahin — der Kampf war ein grüner Fleck in der Ferne, und die Horde blieb
   * ein hochzählender Zähler. Kurze Reichweite verlegt das Geschehen direkt
   * vor die Truppe, wo man es sieht.
   */
  fireRange: 19,
  /**
   * Auf so viele Gegner verteilt sich das Feuer gleichzeitig.
   *
   * Ohne Begrenzung würde die Armee die ganze Welle auf einmal einschmelzen;
   * mit ihr entsteht eine Front, die sich sichtbar durchfrisst.
   */
  maxTargets: 14,
  /** Abstand, ab dem ein Zombie die Armee erreicht (Meter). */
  contactRange: 2.2,
  /**
   * Erreichten ALLE Gegner einer Welle gleichzeitig die Armee, kostete das
   * pro Sekunde diesen Anteil der Kampfkraft. Sie erreichen sie nie alle —
   * das ist die Obergrenze, gegen die das Feuer arbeitet.
   */
  contactDpsFraction: 0.18,
  /** Sekunden, die ein toter Zombie noch sichtbar zusammensackt. */
  deathFadeSeconds: 0.4,
  /**
   * Wie schnell ein Zombie seitlich auf die Armee zuhält (Meter/Sekunde).
   *
   * Null, und das ist eine Entscheidung.
   *
   * Ein Zombie hat rund siebzehn Sekunden Anflug. Schon ein langsames
   * seitliches Nachziehen ließ in dieser Zeit die ganze Welle auf einer
   * Linie zusammenlaufen: Sie traf als Kolonne ein statt als Horde, und
   * Ausweichen war wirkungslos, weil ohnehin jeder ankam.
   *
   * Sie laufen jetzt stur geradeaus. Wie viele überhaupt zubeißen,
   * entscheidet allein das Lenken — damit hat der Spieler im Kampf dieselbe
   * Handhabe wie an den Toren, und mehr braucht ein Auto-Runner nicht.
   */
  homingSpeed: 0,
} as const;

export const WAVES = {
  /** Abstand zwischen zwei Wellen in Metern. */
  spacingMeters: 62,
  /** Erste Welle erst nach dieser Strecke — Ruhe zum Ankommen. */
  firstWaveMeters: 96,
  /** So weit im Voraus werden Wellen erzeugt (muss > Sichtweite sein). */
  lookaheadMeters: 200,
  /** So weit hinter der Armee werden Reste aufgeräumt. */
  cleanupMeters: 30,
  /** Lebenspunkte-Budget einer Welle als Anteil der Armeestärke. */
  intensityStart: 0.6,
  /** … und so viel kommt pro Gefahrenstufe dazu. */
  intensityPerThreat: 0.45,
  /**
   * Die Obergrenze entscheidet, ob der Kampf je beißt.
   *
   * Eine Welle ist geräumt, sobald ihr Budget durch die Feuerkraft geteilt
   * kleiner ist als die Anflugzeit (rund 2,7 s). Mit einer zu niedrigen
   * Grenze schmilzt jede Welle vor der Berührung — der Zähler läuft, aber
   * nichts steht auf dem Spiel. Ab hier holen die Wellen auf.
   */
  intensityMax: 8,
  /** Zombies in der ersten Welle. */
  countStart: 9,
  /** … plus so viele je Gefahrenstufe. */
  countPerThreat: 3.5,
  /** Nie mehr gleichzeitig sichtbar, als das Renderbudget erlaubt. */
  countMax: 40,
  /**
   * Seitliche Streuung einer Welle (halbe Breite in Metern).
   *
   * Deckt fast die ganze Fahrbahn ab: Ausweichen soll die Zahl der Bisse
   * senken, nie eine Welle vollständig umgehen können.
   */
  spreadHalfWidth: 5,
  /** Tiefe einer Welle in Metern — sie kommt nicht als Wand. */
  depthMeters: 13,
} as const;
