# Last Stand: Zombie Front — Umsetzungsplan

> Master-Spezifikation: siehe Briefing (Masterprompt). Dieses Dokument ist die
> technische Übersetzung davon: Architektur, Datenmodelle, Reihenfolge, Risiken,
> Annahmen. Es wird pro Phase fortgeschrieben.

Stand: Phasen 1 bis 6 abgeschlossen (ohne Supply Drops und Hazards).
Phasen 7–9 offen.

---

## 1. Verortung im Repository

Das Spiel liegt als **eigenständiges Subprojekt** unter
`games/last-stand-zombie-front/` mit eigener `package.json`, eigenem Vite-Setup
und eigenem TypeScript-Config.

Begründung: Das Wurzel-Repository ist eine Next.js/Remotion-Anwendung
(`infographics-studio`). Das Spiel darf keine Runtime-, Build- oder
Dependency-Kopplung dorthin haben — YouTube Playables verlangt ein autarkes
Bundle. Getrennte Toolchains sind hier die einfachste Garantie dafür.

---

## 2. Architekturüberblick

Vier Schichten, Abhängigkeiten zeigen ausschließlich nach unten:

```
┌─────────────────────────────────────────────────────────┐
│  scenes/         BootScene · LoadingScene · MenuScene    │  Präsentation
│  ui/             RunScene · ResultsScene · HUD           │
├─────────────────────────────────────────────────────────┤
│  run/  army/  enemies/  combat/  progression/            │  Spiellogik
│  (RunDirector, ArmyManager, CombatSystem, MetaProgression)│
├─────────────────────────────────────────────────────────┤
│  core/           GameState · EventBus · Types · Config   │  Kern
│  config/         gameBalance · unitTiers · … (Daten)     │
├─────────────────────────────────────────────────────────┤
│  platform/  save/  audio/  ads/                          │  Infrastruktur
│  (PlatformService-Abstraktion, SaveManager, AudioManager)│
└─────────────────────────────────────────────────────────┘
```

### Feste Regeln

1. **Kein Gameplay-Code kennt YouTube.** Alles läuft über `PlatformService`.
   Ein `grep -r "playables\|ytgame" src/ --exclude-dir=platform` muss leer sein.
2. **Simulation ist von Rendering getrennt.** `ArmyManager`, `CombatSystem`,
   `RunDirector` sind reine TypeScript-Logik ohne Babylon-Import und damit ohne
   Browser headless testbar. Nur `*Renderer`- und `scenes/`-Dateien importieren
   `@babylonjs/core`.
3. **Keine Magic Numbers in Systemen.** Zahlen leben in `src/config/*.ts`.
4. **Kommunikation über `EventBus`**, nicht über direkte Querverweise zwischen
   Systemen. Szenen abonnieren, Systeme publizieren.
5. **Fixed-Step-Simulation** (60 Hz), Rendering interpoliert nicht — bei
   Framedrops wird die Simulation gebündelt nachgezogen (max. 5 Steps/Frame),
   damit Balancing framerate-unabhängig bleibt.

### Modulgrenzen (wer darf wen importieren)

| Modul | darf importieren |
|---|---|
| `core/`, `config/` | nichts aus dem Projekt (außer `core/Types`) |
| `platform/`, `save/` | `core/` |
| `army/`, `enemies/`, `combat/`, `run/`, `progression/` | `core/`, `config/` |
| `army/SoldierRenderer`, `scenes/`, `ui/` | alles + Babylon |
| `app/` | alles |

---

## 3. Datenmodelle

### 3.1 Armee — Combat Power vs. Display Count

Das zentrale System. Drei getrennte Größen:

```ts
interface ArmyState {
  /** Mathematische Wahrheit. Immer in Tier-1-Basiseinheiten (Militia-Power). */
  combatPower: number;
  /** Index in UNIT_TIERS. Bestimmt Modell, Feuerkraft, Optik. */
  tierIndex: number;
  /** Nur Anzeige/Rendering. Abgeleitet, nie Quelle der Wahrheit. */
  displayCount: number;
  /** Rest-Fortschritt unterhalb einer vollen Einheit des aktuellen Tiers. */
  overflowProgress: number;
}
```

Ableitungsregeln (in `CombatPowerSystem`, rein funktional):

```
powerPerUnit(tier)      = tier.powerPerUnit          // aus config/unitTiers
rawUnits                = combatPower / powerPerUnit(currentTier)
displayCount            = clamp(floor(rawUnits), 1, DISPLAY_CAP_ALLIES)
overflowProgress        = rawUnits - floor(rawUnits)
```

**Promotion** (bei Checkpoint bzw. Promotion-Trigger):

```
Beispiel: 237 Militia, Tier 1 → Tier 2 (100 Militia = 1 Rifleman)
  combatPower bleibt 237            ← Power geht NIE verloren
  tierIndex   1 → 2
  displayCount = floor(237/100) = 2 Riflemen
  overflowProgress = 0.37           ← wird als Fortschrittsbalken gezeigt
```

Entscheidend: `combatPower` ist eine **invariante Größe** über Promotions
hinweg. Promotion ändert nur, *wie* diese Power dargestellt und mit welchen
Tier-Modifikatoren (Feuerrate, Durchschlag) sie im Kampf verrechnet wird.
Dadurch kann Restpower per Konstruktion nicht verschwinden.

Damit Promotion sich **stärker** anfühlt, obwohl die Köpfe weniger werden:
- Tier-Modifikatoren (`damageMultiplier`, `fireRateMultiplier`, `pierce`)
  greifen multiplikativ auf die Power.
- Sichtbar größere/markantere Modelle, andere Farbe, Mündungsfeuer-Skalierung.
- Promotion-Sequenz: kurzer Zeitlupen-Blitz, Sound, HUD-Tierwechsel.
- Direkt nach Promotion wächst `displayCount` wieder spürbar schnell an.

### 3.2 Zahlbereiche

`combatPower` wächst über Tiers exponentiell (100^n). Bei Tier 5 sind
Größenordnungen von 10^8+ realistisch, im Endlosmodus mehr. `number` (double,
2^53 exakt) trägt das bis ca. Tier 6–7 problemlos. **Annahme:** kein BigInt für
V1; ein `NumberFormat`-Helper (1.2K / 3.4M / 5.6B) übernimmt die Darstellung.
Wenn Endless jenseits 10^15 skaliert, wird auf eine Mantisse/Exponent-Struktur
umgestellt — die Kapselung in `CombatPowerSystem` macht das zu einer lokalen
Änderung.

### 3.3 Run

```ts
interface RunState {
  mode: 'campaign' | 'survival' | 'endless';
  sectorIndex: number;
  sectors: SectorPlan[];        // vorab generiert (campaign/survival)
  threatLevel: number;          // endless: steigt pro Sektor
  army: ArmyState;
  runModifiers: RunModifier[];  // Roguelite-Karten aus Checkpoints
  stats: RunStats;              // kills, bosses, sectors, peakTier …
}

interface SectorPlan {
  type: SectorType;             // gates | combat | hazard | elite | holdout | boss …
  lengthMeters: number;
  seed: number;                 // deterministische Generierung
  entries: SectorEntry[];       // Gates, Spawns, Hazards mit z-Position
}
```

Sektoren werden **deterministisch aus einem Seed** generiert. Damit ist ein Run
reproduzierbar (Debugging, Balancing, evtl. Replay-Verifikation) ohne
Replay-Daten zu speichern.

### 3.4 Savegame

```ts
interface SaveDataV1 {
  version: 1;
  meta: { coins: number; techParts: number; xp: number };
  upgrades: Record<string, number>;   // upgradeId → Level
  unlocks: string[];                  // Modi, Zonen, Tiers
  progress: { campaignSector: number; highestTier: number };
  stats: { runs: number; kills: number; bestScore: number; bestEndlessSector: number };
  settings: { audio: boolean; haptics: boolean };
  tutorialDone: boolean;
}
```

Versioniert, mit Migrationskette in `save/migrations/`. Unbekannte künftige
Versionen werden nicht "repariert", sondern führen zu einem sauberen Reset mit
Log-Warnung (verhindert korrupte Zustände).

---

## 4. Implementierungsreihenfolge

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Setup, PlatformService, Szenen-Gerüst, Kamera + Lane-Prototyp | **fertig** |
| 2 | Auto-Vorwärtsbewegung, Lateral-Steuerung, Crowd-Instancing, erste Gates | **fertig** |
| 3 | CombatPower, Tier-System, Promotion, Overflow, HUD-Anbindung | **fertig** |
| 4 | Zombie-Archetypen, aggregiertes Kampfsystem, Boss | **fertig** |
| 5 | Sektoren, RunDirector, Checkpoints, Results | **fertig** (Supply Drops & Hazards offen) |
| 6 | Coins, UpgradeTree, Unlocks, Save/Load produktiv | offen |
| 7 | EndlessDirector, Threat-Eskalation, Score | offen |
| 8 | YouTubePlatformService real, Ads, Lifecycle, Score-Submit | offen |
| 9 | UI-Politur, Audio, VFX, Balancing, Performance, QA | offen |

Nach jeder Phase: Statusbericht, dann Freigabe abwarten.

---

## 5. Technische Risiken

| # | Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|---|
| R1 | **Crowd-Performance auf Mobile.** 120 Alliierte + 200 Zombies mit Animation | Framerate bricht ein | Thin Instances, keine Skelett-Animation für Masse (Positions-/Rotations-Wobble im Vertex-Shader oder simple Hüpf-Kurve), 1 Material pro Fraktion. Budget: ≤ 30 Draw Calls im Run. Ab Phase 2 mit echtem Zähler messen. |
| R2 | **Bundle-Größe.** Babylon-Vollimport ist mehrere MB | Ladezeit, evtl. Playables-Limit | Nur `@babylonjs/core` mit Side-Effect-Imports pro Feature, kein `babylonjs`-Metapaket, keine Inspector/Loaders im Prod-Build. Budget-Check im Validator. |
| R3 | **Playables-SDK-Verhalten unbekannt/änderbar** | Integration bricht spät | Vollständige Abstraktion ab Tag 1 + LocalPlatformService als Referenzimplementierung. Phase 8 tauscht nur eine Datei. |
| R4 | **Zahlen-Overflow bei Endless** | falsche Balance, NaN | Kapselung in `CombatPowerSystem`, Format-Helper, Unit-Tests auf Promotion-Invarianten. |
| R5 | **Promotion fühlt sich als Rückschritt an** | Kernmechanik verpufft | Design-Gegenmaßnahmen (s. 3.1) + Promotion nur an inszenierten Checkpoints, nie mitten im Kampf. Frühes Playtesting in Phase 3. |
| R6 | **Rundenlänge 2–5 min langweilt** | Retention | Sektortypen-Wechsel alle 25–40 s, Roguelite-Auswahl an Checkpoints. Kadenz wird in `config/sectors.ts` als Kurve gepflegt, nicht im Code. |
| R7 | **Determinismus vs. Framerate** | Balance framerate-abhängig | Fixed-Step-Simulation (Punkt 2, Regel 5), seeded PRNG statt `Math.random()` in der Generierung. |
| R8 | **Audio-State von YouTube** | Ton spielt trotz Mute | Sämtliche Wiedergabe über `AudioManager`, der `platform.isAudioEnabled()` prüft und auf Änderungen hört. |
| R9 | **Asset-Pipeline.** Externe Assets sind verboten | Compliance-Verstoß | Alle Assets in `public/assets/`, Validator prüft den Build auf absolute/externe URLs. Phase 1 nutzt reine Prozedural-Geometrie. |

---

## 6. Offene Annahmen (bitte bestätigen oder korrigieren)

1. **A1 — Ort im Repo.** Subprojekt unter `games/last-stand-zombie-front/`
   statt Wurzel, um die bestehende Next.js-App nicht zu berühren.
2. **A2 — Grafik.** V1 arbeitet mit prozeduraler Box-/Kapsel-Geometrie und
   Vertex-Farben statt eingekaufter Modelle. Sieht bewusst „stylized clean" aus
   und hält das Bundle klein. Echte Modelle können später eingehängt werden,
   die Renderer-Schnittstelle bleibt gleich.
3. **A3 — Portrait-first.** Zielauflösung 1080×1920, Landscape wird unterstützt,
   aber nicht optimiert.
4. **A4 — Sprache.** UI-Texte über eine kleine `strings`-Map, Default Englisch
   (Playables-Publikum ist international), `platform.getLanguage()` wird
   ausgewertet. Code-Kommentare/Doku auf Deutsch.
5. **A5 — Keine echten Playables-SDK-Aufrufe vor Phase 8.** Der
   `YouTubePlatformService` existiert bereits, ist aber gegen ein *angenommenes*
   SDK-Interface geschrieben und muss in Phase 8 gegen die reale Doku
   verifiziert werden. Er ist so gebaut, dass fehlende SDK-Methoden sauber auf
   No-Op/Fallback laufen statt zu werfen.
6. **A6 — Kein BigInt in V1** (siehe 3.2).
7. **A7 — Tests.** Vitest für die reine Logik (Power/Promotion/Save/Generierung).
   Kein Rendering-Test, kein E2E in V1.

---

## 7. Was Phase 1 konkret liefert

- Vite + TypeScript + `@babylonjs/core`, Strict Mode, Build ohne Warnungen.
- `PlatformService`-Interface, `LocalPlatformService` (localStorage, gemockte
  Ads/Score/Lifecycle), `YouTubePlatformService` (vorbereitet, Feature-Detection).
- `EventBus`, `GameState`, `Types`, `Config`, erste `config/*`-Dateien inkl.
  vollständiger Tier-Tabelle.
- Szenen-Maschine: Boot → Loading → Menu → Run → Results, mit sauberem
  Auf-/Abbau je Szene.
- Run-Prototyp: Kamera (erhöht, portrait-tauglich), scrollende Lane, Marker,
  Fixed-Step-Loop, Input-Handling (Drag/Maus/Tastatur) — noch ohne Armee.
- `SaveManager` mit Schema v1 + Migrationsgerüst.
- `youtube:validate`-Skript: prüft Build auf externe URLs, absolute Pfade,
  `index.html` im Root, Bundle-Größe. `youtube:build` erzeugt das ZIP.
- Vitest-Setup mit ersten Tests (Save-Roundtrip, EventBus, Config-Integrität).

### Gemessene Ergebnisse

| Kennzahl | Wert | Bewertung |
|---|---|---|
| Draw Calls im Run | **6** | Budget ≤ 30. Instancing trägt. |
| Meshes in der Szene | 137 (6 Master + Instanzen) | wie erwartet |
| Bundle (JS) | 1,60 MB roh · **381 kB gzip** | fast vollständig Babylon; s. R2 |
| Bundle gesamt (ZIP) | ~376 kB | unkritisch |
| Tests | 38 grün | — |
| Externe Requests im Durchlauf | **0** | über Playwright-Route mitgeschnitten |

Framerate wurde nur unter SwiftShader (Software-Rendering im Container)
gemessen und ist deshalb nicht aussagekräftig; die Frame-Zeit von ~1 ms zeigt
aber, dass die Szene nicht GPU-gebunden ist. Eine Messung auf echter Hardware
gehört an den Anfang von Phase 2.

### Abweichungen von der ursprünglichen Struktur

- Statt eines Wurzel-`assets/`-Ordners liegen Assets unter `src/assets/` und
  werden **importiert** statt per URL geladen. Nur so garantiert der Bundler,
  dass nichts extern nachgeladen wird.
- `scenes/playfield/` (RunCamera, TrackScenery, SquadMarker) kam hinzu: das
  ist Darstellung und gehört damit weder nach `run/` (Logik) noch direkt in
  die Szene.
- `util/` (Random, math, format) kam hinzu — gemeinsame Helfer ohne
  Spiellogik.

### Was Phase 1 bewusst NICHT enthält

Keine Armee, keine Gates, keine Gegner, kein Kampf, keine Sektoren, kein
Endlosmodus, keine Meta-Upgrades, kein Audio. Der Ergebnisbildschirm zeigt
Platzhalterwerte, und die Runde endet nur über den Knopf „End run".


---

## 8. Phase 2 — Ergebnis

Die Armee ist echt: Combat Power, abgeleiteter Display Count, Formation,
Thin-Instance-Crowd und Gates mit Konsequenz. Eine Runde endet, wenn nichts
mehr übrig ist.

### Gemessene Ergebnisse

| Kennzahl | Wert | Bewertung |
|---|---|---|
| Draw Calls (mit Crowd + 3 Toren) | 14–16 | Budget ≤ 30 |
| davon die gesamte Armee | **1** | unabhängig von 6 oder 140 Soldaten |
| Frame-Zeit | 0,7–1,0 ms | nicht GPU-gebunden |
| Tests | 73 grün | — |

### Wachstumskurve (Median über 40 Seeds, gutes Spiel)

| Tore | Zeit | Combat Power |
|---|---|---|
| 10 | 0:55 | 372 |
| 20 | 1:46 | 2.132 |
| 30 | 2:37 | 10.434 |
| 40 | 3:28 | 33.407 |

Die Beförderungsschwelle zu Tier 2 liegt bei 1.200 und wird nach etwa 1:45
erreicht — die erste Promotion fällt damit mitten in die Runde, nicht an ihr
Ende. Als Test verankert (`tests/GateBalance.test.ts`), damit spätere
Balance-Änderungen diese Taktung nicht unbemerkt zerstören.

### Zwei Korrekturen an früheren Annahmen

1. **Strafen sind jetzt proportional statt fest.** Ein „−20" beendet bei 13
   Soldaten die Runde und ist bei 10.000 nicht mehr messbar. Zu einer Kurve,
   die sich alle paar Tore verdoppelt, passen nur Faktoren.
2. **Additive Tore zählen in Einheiten des aktuellen Tiers.** „+10" heißt
   zehn Soldaten der Sorte, die gerade marschiert — sonst wäre jedes
   additive Tor ab Tier 2 wertlos.

### Gefundene und behobene Fehler

- **UI-Leck:** `exit()` hat Felder genullt, BEVOR die registrierten
  Aufräumer liefen — die Closures griffen ins Leere, HUD und Debug-Overlay
  blieben nach jeder Runde im DOM. Betraf bereits Phase 1. Aufräumer halten
  jetzt lokale Referenzen, die ein späteres Nullen nicht entwerten kann.
- **Unsichtbare Tore:** `clone()` erbt `isVisible = false` vom Template.
- **Kopfstehende Beschriftung:** `DynamicTexture.update(invertY)` stand auf
  `false`. Bei Ziffern fällt das kaum auf — eine „2" wird dann aber als „5"
  gelesen. Diagnostiziert mit Farbmarken an den Kanten der Zeichenfläche,
  nachdem Textproben bei dieser Schriftgröße keine Aussage zuließen.

### Was Phase 2 nicht enthält

Keine Gegner, keinen Kampf, keine Promotion (Phase 3), keine Sektoren und
keinen RunDirector (Phase 5). Die Runde endet weiterhin nur durch den Knopf
oder durch eine vernichtete Armee.


---

## 9. Phase 3 — Beförderung, und Tore, die man lesen muss

### Tore: Farbe verrät nichts mehr

Alle Tore tragen dieselbe helle Beschilderung mit dunkler Schrift. Verriete
die Farbe, ob eine Seite gut ist, müsste niemand die Zahl lesen — die
Entscheidung wäre gratis. Drei Dinge tragen das:

1. **Eine Farbe für alle.** Bewusst unbunt: Blau, Grün, Gold und Magenta sind
   die Farben der Einheiten-Tiers. Ein blaues Tor neben blauen Riflemen wäre
   keine neutrale Wahl, sondern nur schlecht lesbar.
2. **Gemischte Schreibweisen.** Derselbe Effekt erscheint mal als `×0.5`, mal
   als `−50%`. Die Aufschrift wird IMMER aus dem Wert abgeleitet, nie von Hand
   geschrieben — sonst driften Anzeige und Wirkung auseinander und das Spiel
   lügt.
3. **Paare aus zwei schlechten Seiten** (22 %). Es gibt dann keine sichere
   Wahl, nur eine weniger teure: `×0.05` gegen `−50%` ist genau die Frage, die
   eine Sekunde kostet. Die ersten drei Tore einer Runde sind davon
   ausgenommen — wer bestraft wird, bevor er die Regeln kennt, hört auf.

Ein Tor kann die Runde nicht mehr beenden (Untergrenze 1). Es ist eine
Entscheidung, kein Tod; gestorben wird ab Phase 4 an Gegnern.

### Beförderung

`combatPower` bleibt bei einer Beförderung **unverändert**. Es wird nichts
eingetauscht, nur die Sorte Soldat gewechselt, in der dieselbe Stärke
dargestellt wird. Restkraft kann dadurch gar nicht verloren gehen — sie
erscheint als angefangene Einheit (`overflowProgress`) und hat im HUD einen
eigenen Balken. Mehrere Stufen auf einmal sind möglich, wenn die Stärke reicht.

Befördert wird nur am Kontrollpunkt (vorläufig die Sektorgrenze), nie beim
Vorbeifahren an einem Tor: der Aufstieg braucht einen Moment, in dem der
Spieler nichts anderes zu tun hat. Ein Banner benennt das neue Tier — nach der
Beförderung stehen WENIGER Figuren auf dem Feld, und ohne diesen Moment liest
sich der Aufstieg als Verlust.

### Echte Truppenstärke vs. gezeichnete Figuren

Bei einem Tier-Verhältnis von 100:1 sitzt die gezeichnete Truppe lange am
Renderbudget fest, bevor die nächste Schwelle fällig ist. Deshalb sind es
jetzt drei Zahlen statt zwei:

| Feld | Bedeutung |
|---|---|
| `combatPower` | die mathematische Wahrheit |
| `unitCount` | echte Einheiten des Tiers — **das zeigt das HUD** |
| `displayCount` | tatsächlich gezeichnete Figuren, auf 140 gedeckelt |

Ohne diese Trennung sähe der Spieler zwischen 140 und 1.200 Einheiten
Stillstand, wo sich seine Stärke verachtfacht.

### Wachstumskurve nach der Neuabstimmung

| Tore | Zeit | Power (Median) | Tier |
|---|---|---|---|
| 10 | 0:55 | 447 | 0 |
| 20 | 1:46 | 6.164 | 1 |
| 30 | 2:37 | 44.923 | 1–2 |
| 40 | 3:28 | 755.369 | 2 |
| 50 | 4:19 | 5.453.497 | 2–3 |

Erste Beförderung nach etwa 1:30. Eine lange reguläre Runde endet bei Tier 2–3
von 5 — die oberen Stufen bleiben dem Endlosmodus. Beides ist als Test
verankert; ein erster Abstimmungsversuch erreichte Tier 4 nach 4:19 und hätte
die Leiter in einer Runde verbraucht.

### Gefundene und behobene Fehler

- **Beförderung war unsichtbar.** Das Material der Truppe war eingefroren, der
  Farbwechsel ging daran verloren. Per Pixelmessung nachgewiesen: Militia und
  Veterans hatten exakt dieselbe Farbe (139,154,174).
- **Truppe wuchs durch die Leitplanke.** Die Formation wurde gestaucht, ihr
  Anker durfte aber weiter bis an den Fahrbahnrand. Der Anker ist jetzt an die
  Truppenbreite gekoppelt.
- **Formation quer über die Mittellinie.** Bei voller Breite stand die Armee
  beim Passieren auf beiden Seiten und die Wahl war optisch nicht ablesbar.
  Die Truppe wird jetzt nie breiter als eine Fahrbahnhälfte und wächst
  stattdessen in die Länge.
- **Truppe wuchs aus dem Bild.** Die Kamera weicht jetzt zurück und steigt,
  wenn die Formation länger wird.

### Werkzeug

Mit aktivem Debug-Modus setzt `?debug=1&power=5000` die Startstärke. Ohne den
Schalter gibt es keinen Weg dorthin. Späte Spielzustände sind damit in
Sekunden erreichbar statt in Minuten — für Bosse ab Phase 4 dasselbe.

### Was Phase 3 nicht enthält

Keine Gegner, keinen Kampf, keine echten Sektortypen. Der Kontrollpunkt ist
weiterhin nur die 220-Meter-Grenze; ab Phase 5 setzt ihn der RunDirector.


---

## 10. Nachbesserung — Beförderung sichtbar machen, Zwischenspiel einbauen

### Der Befund aus dem Spieltest

„Die Beförderung sehe ich nicht passieren nach 140." Zu Recht — das war ein
Konstruktionsfehler, kein Zufall:

| | mit 100:1 |
|---|---|
| Truppe optisch voll (140 Figuren) | bei Power 140 |
| Beförderung | erst bei Power 1.200 |
| Abstand | **8,6× zu spät**, auf jeder Stufe |

Der Spieler sah einen vollen Bildschirm, sammelte weiter und es passierte
nichts. Die Ursache ist das Verhältnis 100:1 aus der Spezifikation. Es
verträgt sich nicht mit einem Renderbudget von 140 Figuren: Entweder man
befördert bei 140 und bekommt **1,4** Soldaten der nächsten Stufe, oder man
wartet bis 1.200 und die Truppe steht 8,6× lang still.

### Die Entscheidung: 10:1 statt 100:1

Damit fällt die Beförderung **genau dort, wo die Truppe voll ist**, und
hinterlässt einen sichtbaren Trupp von 14 Einheiten. Die Schwelle ist nicht
mehr gesetzt, sondern aus dem Renderbudget abgeleitet — ändert jemand den
Deckel, verschiebt sie sich automatisch mit.

Das weicht bewusst von der Spezifikation ab (dort: „100 Militia = 1
Rifleman"). Deren eigene Forderung — „Die Armee soll sich nach Promotion
mächtiger anfühlen, nicht schwächer" — ist mit 100:1 und einem 140er-Deckel
nicht erfüllbar. Die Zahlen waren als Vorschlag gekennzeichnet.

Folge: Beförderung wird vom seltenen Ereignis zum **Takt der Runde** — erste
nach 24 s, danach etwa alle 35 s, rund sieben in einer langen Runde. Die
Tier-Liste wurde dafür auf zwölf Stufen verlängert; eine reguläre Runde
verbraucht sieben, der Rest bleibt dem Endlosmodus. Ab Phase 4 kosten Gegner
Kampfkraft und flachen die Kurve ab — dann ist die Stufenzahl erneut zu
prüfen.

### Das Zwischenspiel am Kontrollpunkt

Statt still stärker zu werden, hält die Runde an und legt drei Karten hin.

- **Drei verschiedene Arten**, nie dieselbe zweimal. Dreimal dieselbe Wirkung
  in drei Stufen wäre keine Wahl, sondern eine Preisliste.
- **Vier Seltenheiten** (common / rare / epic / legendary), deren Gewichte im
  Lauf der Runde nach oben wandern — späte Karten sollen sich anders anfühlen
  als die ersten.
- **Beschreibung aus dem Wert erzeugt**, nie danebengeschrieben — dasselbe
  Prinzip wie bei den Toraufschriften.
- **Obergrenzen beim Stapeln.** Ohne sie stapeln sich vier legendäre Schilde
  zu völliger Unverwundbarkeit und die Torwahl verliert ihren Sinn.
- Erste Ziehung am ersten Kontrollpunkt (24 s), danach jeder zweite (~49 s).

Seltenheit ist der **einzige** Ort im Spiel, an dem Farbe eine Wertung
ausdrückt. Bei den Toren ist genau das verboten.

### Warum „schneller schießen" noch fehlt

Die sechs ausgelieferten Karten wirken alle sofort: Rekruten, Torertrag,
Torschutz, Tempo, Lenkung, Beförderungsschwelle. Feuerrate, Schaden und
Rüstung fehlen bewusst — es gibt keine Gegner, auf die sie wirken könnten,
und eine Karte, die nichts tut, wäre eine Lüge. Die Felder stehen bereits in
`RunModifiers`, damit das Kampfsystem in Phase 4 nur lesen muss.

### Gefundene und behobene Fehler

- **Beförderungsbanner lief hinter der Auswahl weiter** und blendete nie aus,
  weil seine Laufzeit an der pausierten Spieluhr hing. Beides gehört zum
  selben Kontrollpunkt und steht jetzt in einem Fenster.
- **Erste Ziehung fiel auf Sektor 2** (49 s) statt auf den ersten
  Kontrollpunkt.
- **Wachstumskarten hätten Strafen verstärkt**: ein naiver Faktor auf
  `×0.5` hätte daraus eine Verbesserung gemacht. Zugewinn und Strafe werden
  getrennt verrechnet.


---

## 11. Phase 4 — Die Horde

### Die eine Entscheidung, die alles bestimmt: relative Gegnerwerte

Die Kampfkraft wächst über zwölf Stufen von 8 auf über eine Milliarde. Feste
Gegnerwerte könnten dem unmöglich folgen — sie wären in Sekunde dreißig
tödlich und in Minute drei nicht mehr messbar. Man müsste eine Gegnerkurve
über zwölf Zehnerpotenzen pflegen, die exakt zur Torkurve passt, und jede
Balance-Änderung an den Toren würde sie brechen.

Deshalb bekommt eine Welle ihr Lebenspunkte-Budget als **Anteil der
Armeestärke**. Ein Kampf kostet damit in jeder Spielphase ungefähr gleich
viel, und die Zahlen bleiben von selbst im Rahmen. Der Preis ist ein
Gummiband — hier gewollt: die Machtfantasie steckt im Wachstum der eigenen
Zahl und in der Menge niedergemähter Zombies, nicht im Ausbleiben von
Widerstand.

Archetypen tragen deshalb **Verhältnisse** statt Absolutwerte: Ein Tank ist
immer „achtmal so zäh wie ein Walker", unabhängig von der Spielphase.
Geschwindigkeit bleibt absolut — ein Runner ist schnell, und das darf nicht
davon abhängen, wie stark der Spieler gerade ist.

### Wellen werden erst beim Eintreffen scharf gemacht

Der erste Entwurf legte die Stärke einer Welle beim Erzeugen fest — bis zu
200 Meter im Voraus, also zwanzig Sekunden. In dieser Zeit vervielfacht sich
die Armee durch Tore, und die Welle traf hoffnungslos unterdimensioniert ein.
Messbar: Bei gutem Spiel verlor die Armee über eine ganze Runde **exakt null**
Kampfkraft.

Jetzt tragen die Zombies nur Anteile, bis sie in Reichweite kommen; dort
bekommen sie ihre echten Werte aus der Stärke von *jetzt*. Sichtbar ist der
Unterschied nicht — Lebenspunkte stehen einem Zombie nicht an.

### Gemessene Balance (25 Läufe je Zeile, Median)

| | gutes Spiel | blindes Spiel |
|---|---|---|
| 60 s | 0 Tode, kein Verlust | 2/25 Tode |
| 120 s | 0 Tode, kein Verlust | 10/25 Tode |
| 180 s | 0 Tode, erste Verluste | 17/25 Tode |
| 260 s | 0 Tode, ~15 % Verlust | 21/25 Tode |

Die erste Minute gehört bewusst dem Ankommen. Ab etwa drei Minuten kostet
der Kampf spürbar. Als Test verankert (`tests/CombatBalance.test.ts`).

### Zwei Korrekturen aus dem Augenschein

Beide Male stimmten die Zahlen und das Bild trotzdem nicht:

1. **Der Kampf fand zu weit weg statt.** Mit 30 Metern Feuerreichweite
   schmolzen die Wellen am Nebelrand — ein grüner Fleck in der Ferne, die
   Horde blieb ein hochzählender Zähler. Jetzt 19 Meter, dafür beißen
   Durchbrüche nur halb so hart. Das Geschehen liegt direkt vor der Truppe.
2. **Die Horde kam als Kolonne statt als Horde.** Zombies zogen seitlich
   nach; bei siebzehn Sekunden Anflug lief dabei die ganze Welle auf einer
   Linie zusammen — und Ausweichen war wirkungslos, weil ohnehin jeder ankam.
   Sie laufen jetzt stur geradeaus, gestreut über fast die ganze Fahrbahn.
   Wie viele zubeißen, entscheidet allein das Lenken.

### Leistung

Ein Thin-Instance-Mesh je Archetyp: fünf Draw Calls für beliebig viele
Zombies. Gesamt 19–21 von 30 Budget. Gleichzeitig sichtbar: 32–88 Zombies,
Grenze 220.

### Was noch fehlt

Der Boss. Ebenso Spitter und Exploder — beide brauchen Projektile
beziehungsweise Explosionen, die es noch nicht gibt. Mündungsfeuer und
Treffereffekte sind Phase 9.


---

## 12. Der Boss

### Arena statt Mitlaufen

Ein Boss ist kein besonders zäher Zombie, sondern ein Bruch im Rhythmus: Die
Fahrt hält an, und die ganze angesammelte Feuerkraft trifft auf eine einzige
Lebensleiste. Liefe er einfach mit, wäre er nur ein Brute mit mehr Punkten.

Alle drei Sektoren wartet einer am Sektorende. Gelenkt wird in der Arena
weiter — Ausweichen ist die einzige Handhabe, die dem Spieler im Kampf
bleibt. Drei Phasen bei 66 % und 33 % der Lebenspunkte: Je näher das Ende,
desto schneller schlägt er zu und desto häufiger ruft er Verstärkung. Ein
Phasenwechsel unterbricht den laufenden Takt, damit der neue Abschnitt sofort
spürbar ist.

Wie eine Welle bekommt er seine Werte erst beim Betreten der Arena — sonst
stünde am Sektorende ein Gegner, der zur Armee von vor zwanzig Sekunden passt.

### Gemessene Balance (20 Läufe je Zelle)

| | gutes Spiel | blindes Spiel |
|---|---|---|
| 140 s | 1/20 Tode, 1 Boss | 13/20 Tode |
| 200 s | 3/20 Tode, 2 Bosse | 18/20 Tode |
| 260 s | 3/20 Tode, 3 Bosse | 18/20 Tode |

Der erste Boss kostet im Median **30 % der Kampfkraft** — der Zielkorridor
liegt zwischen 15 % und 55 %: darunter ist er Kulisse, darüber beendet er die
Runde. Alles davon ist als Test verankert.

### Zwei Fehler, die nur die Messung zeigte

Beide wurden gefunden, weil der Boss in die Balance-Simulation aufgenommen
wurde, statt ihn nach Augenmaß abzustimmen.

1. **Die Feuerkraft versickerte.** `blocking` war schon wahr, sobald ein Boss
   AUFGESTELLT wurde — zwanzig Sekunden bevor die Armee ihn erreichte. In
   dieser Zeit leitete das Kampfsystem 65 % des Feuers an einen noch nicht
   scharfen Boss um, wo es spurlos verschwand; die Horde lief ungestört durch,
   und die Armee erreichte die Arena bereits ausgezehrt. Ziel ist jetzt nur
   ein Boss, dessen Kampf tatsächlich läuft.
2. **Die Gerufenen töteten jeden Lauf.** Sieben Runner trugen zusammen zehn
   Prozent der Armeestärke **pro Sekunde** an Bissschaden — mehr als eine
   ganze reguläre Welle aus dreißig Zombies. Vor der Korrektur starben 20 von
   20 Läufen am ersten Boss, danach fallen 19 von 20 Bossen. Gerufene sind
   Störfeuer, die Gefahr ist der Boss.

Dazu ein Anzeigefehler: Die Lebensleiste erschien beim Aufstellen und stand
zwanzig Sekunden lang auf null. Sie erscheint jetzt mit dem ersten Schlag und
nimmt den Platz der Sektorleiste ein — beide übereinander waren unlesbar, und
während eines Bosskampfes steht der Sektor ohnehin still.

### Leistung

21–22 Draw Calls von 30. Der Boss ist ein einzelnes Mesh; es gibt nie zwei
gleichzeitig.


---

## 13. Phase 5 — Der Regisseur

### Sektortypen als Regler, nicht als Code

Bis hierher war jeder Abschnitt derselbe: dieselbe Mischung aus Toren und
Wellen, alle 220 Meter aufs Neue. Eine Runde von vier Minuten war nach
dreißig Sekunden erzählt.

Jeder Sektortyp verschiebt jetzt dieselben drei Regler in eine andere
Richtung — Tordichte, Wellendichte, Wellenwucht:

| Typ | Charakter |
|---|---|
| Supply Line | dichte Torfolge, kaum Widerstand — der Abschnitt zum Wachsen |
| Overrun | kaum Tore, Welle auf Welle |
| Ruins | ausgeglichen |
| Elite Hunt | wenige, aber schwere Begegnungen |
| Last Stand | Dauerbeschuss auf kurzer Strecke |
| Boss | die Arena |

Ein neuer Typ braucht deshalb keinen neuen Code, nur eine neue Zeile.

### Der RunDirector

Er kennt als Einziger die Abfolge und beantwortet allen anderen Systemen
dieselbe Frage: „Was gilt an dieser Stelle der Strecke?" Entscheidend ist,
dass er auch nach Positionen **weit voraus** gefragt werden kann — Tore und
Wellen werden bis zu zweihundert Meter im Voraus gesetzt und müssen wissen,
in welchem Abschnitt sie landen. Sonst trüge der Bosssektor die Tordichte
des Abschnitts, in dem die Armee gerade steht.

`GateSystem` und `ZombieSpawner` kennen den Director nicht; sie sehen nur
eine schmale Schnittstelle mit drei Fragen. Tests reichen dafür eine
Attrappe.

Zwei Plätze sind fest vergeben: Der erste Sektor ist immer ein Tor-Sektor
(wer mit „Overrun" beginnt, lernt die Torwahl nie kennen), und jeder dritte
endet mit einem Boss.

### Ein echtes Ende

Eine endliche Runde schließt mit einem Bosssektor — sie endet mit einem
Gegner, nicht mit einer Ziellinie. Sieg gibt es nur, wenn der Schlussboss
fällt, nicht schon beim Überfahren einer Distanzmarke; sonst könnte man an
ihm vorbeilaufen. Der Knopf heißt jetzt „Quit" statt „End run": Er ist der
Abbruch, nicht der vorgesehene Weg zum Abschluss.

Gemessener Kampagnenlauf: **1:58 bis 2:13** über fünf Sektoren, zwei Bosse,
rund 200–260 erledigte Zombies. Damit liegt eine Runde im Zielkorridor der
Spezifikation.

### Neu abgestimmt

Der Director machte das Spiel zunächst deutlich schwerer — kürzere Sektoren
lassen die Gefahrenstufe schneller steigen, und Kampfsektoren brachten 60 %
mehr Wellen. Die Überlebensrate bei gutem Spiel fiel von 85 % auf 60 %, und
die erste Minute war nicht mehr folgenlos. Nach dem Herunterstimmen von
Kampf-, Elite- und Holdout-Sektoren:

| | gutes Spiel | blindes Spiel |
|---|---|---|
| 55 s | 0/20 Tode, kein Verlust | 4/20 Tode |
| 140 s | 0/20 Tode | 11/20 Tode |
| 260 s | 1/20 Tode | 15/20 Tode |

Die Balance-Simulation benutzt jetzt denselben Director wie das Spiel —
vorher hätte sie eine Sektorfolge gemessen, die es nicht mehr gibt.

### Was aus Phase 5 noch fehlt

Supply Drops und Hazards. Beide brauchen eine eigene Kollisionsschicht auf
der Strecke; der Sektortyp „Ruins" ist bereits vorgesehen, unterscheidet
sich aber bislang nur über die Regler.


---

## 14. Phase 6 — Der Grund für die zweite Runde

### Zwei Arten von Aufwertung, ein Ziel

| | Karten am Kontrollpunkt | Laden zwischen den Runden |
|---|---|---|
| Herkunft | gezogen | gekauft |
| Dauer | eine Runde | für immer |
| Wirkung | dieselben `RunModifiers` | dieselben `RunModifiers` |

Der letzte Punkt ist der wichtige: Das Kampfsystem muss nicht wissen, woher
ein Bonus stammt. Dauerhafte Aufwertungen werden VOR den Karten eingetragen,
damit die Obergrenzen den Gesamtwert deckeln und nicht die Reihenfolge.

Sieben Aufwertungen, fünf für Münzen, zwei für Tech Parts — damit die
zweite Währung vom ersten Tag an einen Zweck hat statt sich totzulaufen.
Jede Stufe ist klein; der Reiz liegt in der Menge und den steigenden Kosten,
nicht darin, dass eine einzelne die Runde entscheidet.

### Ökonomie

Gemessener Kampagnenlauf: **513 Münzen und 2 Tech Parts**. Die günstigste
Aufwertung kostet 90, die teuerste erste Stufe 160 — eine Runde kauft also
ein bis zwei frühe Stufen. Nach dem ersten Lauf waren sechs von sieben
Aufwertungen bezahlbar.

Der Score dämpft die verbleibende Kampfkraft mit einem Exponenten unter eins.
Sie wächst über eine Runde um Zehnerpotenzen; ungedämpft wären Sektoren,
Kills und Bosse im Score bedeutungslos.

### Verbucht wird an genau einer Stelle

`bankRunResult` ist die einzige Funktion, die den Spielstand nach einer Runde
verändert — sonst verteilt sich die Buchhaltung über mehrere Szenen und
driftet auseinander. Der Ergebnisbildschirm löscht danach `lastResult`: Würde
die Szene erneut aufgebaut, wäre ein zweites Gutschreiben Falschgeld.

### Freischaltung

Der Endlosmodus öffnet sich nach dem ersten gewonnenen Feldzug — er setzt
voraus, dass man das Spiel einmal ganz gesehen hat.

### Geprüft

Ein vollständiger Durchlauf im Browser: Endlosmodus gesperrt → Laden leer und
nichts bezahlbar → Kampagne gewonnen → 513 Münzen gutgeschrieben →
Endlosmodus offen → Aufwertung gekauft (Stufe 0 → 1, Kontostand 513 → 423) →
**Seite neu geladen, alles noch da**.

Dazu ein Test, der sicherstellt, dass ein voll ausgebauter Spielstand
zusammen mit legendären Karten die Armee nicht unverwundbar macht.
