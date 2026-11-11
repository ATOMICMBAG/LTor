// Learning content of the Laserlabor (German UI texts).
// Physics/safety statements follow textbook knowledge and IEC 60825-1 /
// TROS Laserstrahlung in simplified form – see disclaimers in the UI.

import type { LaserClass } from "@shared/laserPhysics";

export type LabPart =
  | "LaserHead"
  | "Aperture"
  | "HeatSink"
  | "TEC"
  | "EmissionLED"
  | "KeySwitch"
  | "Shutter"
  | "Rail"
  | "Lens"
  | "PowerMeter"
  | "Breadboard"
  | "Beam"
  | "Plane";

export interface PartInfo {
  title: string;
  what: string;
  physics: string;
  practice: string;
}

export const PARTS: Record<LabPart, PartInfo> = {
  LaserHead: {
    title: "Laserkopf",
    what: "Gehäuse mit Laserdiode bzw. Laserkristall, Kollimationsoptik und Treiberelektronik.",
    physics:
      "Laser = Light Amplification by Stimulated Emission of Radiation. Voraussetzungen: " +
      "ein aktives Medium mit Besetzungsinversion, eine Pumpquelle und ein optischer " +
      "Resonator, der einen Teil des Lichts zurückkoppelt.",
    practice:
      "Das Warnschild (gelbes Dreieck) und das Klassenschild sind Pflicht. Gehäuse von " +
      "Lasern der Klasse 3B/4 dürfen nur durch unterwiesene Personen geöffnet werden.",
  },
  Aperture: {
    title: "Austrittsöffnung (Apertur)",
    what: "Hier verlässt der kollimierte Strahl den Laserkopf – Position z = 0 der Bank.",
    physics:
      "Am Austritt hat der Strahl den Taillenradius w₀ (1/e²-Radius). Je kleiner w₀, desto " +
      "größer die Divergenz θ = M²·λ / (π·w₀): Beugung lässt sich nicht überlisten.",
    practice:
      "Nie in die Apertur blicken – auch nicht bei vermeintlich ausgeschaltetem Laser. " +
      "Strahlhöhe auf dem Tisch halten, unterhalb der Augenhöhe.",
  },
  HeatSink: {
    title: "Kühlkörper",
    what: "Führt die Verlustwärme des TEC und der Diode an die Umgebung ab.",
    physics:
      "Nur ein Teil der elektrischen Leistung wird zu Licht (Wall-Plug-Effizienz). Der Rest " +
      "P_el − P_opt ist Wärme. Die Sperrschicht erwärmt sich um ΔT = R_th · P_Wärme.",
    practice: "Lüftungsschlitze freihalten. Ein überhitzter Kühlkörper verschiebt Wellenlänge und Schwelle.",
  },
  TEC: {
    title: "Thermoelektrischer Kühler (TEC, Peltier)",
    what: "Regelt die Temperatur der Diode auf den Sollwert (gelbe Schicht unter dem Kopf).",
    physics:
      "Die Temperatur bestimmt Schwellstrom (I_th ∝ exp(T/T₀)), Effizienz und – bei " +
      "Halbleitern – die Wellenlänge (≈ 0,05–0,3 nm/K). Beim DPSS-Laser muss die " +
      "Pumpwellenlänge die Absorptionslinie des Kristalls treffen.",
    practice:
      "Nicht unter den Taupunkt kühlen (Kondenswasser!). Nach Sollwertänderung warten, " +
      "bis die Temperatur eingeschwungen ist (Zeitkonstante einige Sekunden).",
  },
  EmissionLED: {
    title: "Emissionsanzeige",
    what: "Leuchtet, sobald Emission freigegeben ist – auch während der Emissionsverzögerung.",
    physics: "Die Anzeige zeigt die Freigabe, nicht die tatsächliche Leistung.",
    practice:
      "Ab Klasse 3R vorgeschrieben (IEC 60825-1). Leuchtet sie, gilt der Laser als aktiv – " +
      "Laserschutzbrille tragen.",
  },
  KeySwitch: {
    title: "Schlüsselschalter",
    what: "Gibt die Emission frei. Ohne Schlüssel kann der Laser nicht strahlen.",
    physics: "Sicherheitstechnische Freigabe, kein Teil der Laserphysik.",
    practice:
      "Bei Klasse 3B und 4 Pflicht. Schlüssel nach Gebrauch abziehen und verwahren, damit " +
      "Unbefugte den Laser nicht einschalten können.",
  },
  Shutter: {
    title: "Shutter (Strahlverschluss)",
    what: "Mechanische Blende vor der Apertur. Geschlossen blockiert er den Strahl.",
    physics:
      "Der Laser läuft hinter dem Shutter weiter – thermisch stabil. Darum misst der " +
      "Leistungsmesser bei geschlossenem Shutter 0, obwohl der Laser emittiert.",
    practice:
      "Beim Justieren und bei Arbeiten im Strahlengang Shutter schließen, statt den Laser " +
      "aus- und wieder einzuschalten.",
  },
  Rail: {
    title: "Optische Schiene",
    what: "Führung mit Skala, auf der der Linsenreiter entlang der optischen Achse gleitet.",
    physics: "Alle Positionen z werden von der Apertur aus gemessen (z = 0).",
    practice: "Ziehe die Linse im 3D-Bild entlang der Schiene oder nutze den Regler.",
  },
  Lens: {
    title: "Linse (N-BK7, Ø 1″)",
    what:
      "Bis zu fünf Linsen bilden eine Kette auf der Schiene: Sammellinsen (bikonvex, " +
      "plankonvex, Meniskus) und Zerstreuungslinsen. Form und Brennweite im Reiter „Optik“.",
    physics:
      "Gaußstrahl durch dünne Linse: 1/q′ = 1/q − 1/f mit dem komplexen Strahlparameter " +
      "q = z + i·z_R – Linse für Linse nacheinander angewendet. Für einen kollimierten " +
      "Strahl gilt w₀′ ≈ M²·λ·f / (π·w_L). Die Form folgt aus der Linsenmacher-Gleichung " +
      "1/f = (n − 1)(1/R₁ − 1/R₂); sie ändert f nicht, aber die Abbildungsfehler.",
    practice:
      "Im Fokus ist die Leistungsdichte um Größenordnungen höher – Brandgefahr! Linse nur " +
      "bei geschlossenem Shutter verschieben.",
  },
  PowerMeter: {
    title: "Thermischer Leistungsmesser",
    what: "Absorbiert den Strahl vollständig und misst die Leistung (dient zugleich als Strahlfalle).",
    physics:
      "Die absorbierte Leistung erwärmt den Sensor; die Thermosäule liefert eine zur " +
      "Leistung proportionale Spannung. Wellenlängenunabhängig, aber träge (≈ 1 s).",
    practice:
      "Jeder Strahl muss in einer Strahlfalle enden. Maximale Leistungsdichte des " +
      "Messkopfs beachten – fokussierte Strahlen können den Absorber zerstören.",
  },
  Breadboard: {
    title: "Optischer Tisch (Breadboard)",
    what: "Schwingungsgedämpfte Platte mit M6-Gewinderaster (25 mm).",
    physics: "Mechanische Stabilität ist Voraussetzung für reproduzierbare Strahlführung.",
    practice: "Keine reflektierenden Werkzeuge (Schraubendreher, Uhren, Ringe) in den Strahlengang halten.",
  },
  Beam: {
    title: "Laserstrahl (Gaußstrahl)",
    what: "Der Strahlradius ist im 3D-Bild stark überhöht dargestellt, sonst wäre er unsichtbar dünn.",
    physics:
      "Intensität I(r) = I₀ · exp(−2r²/w²). Der Radius w(z) = w₀·√(1 + (z/z_R)²) wächst " +
      "jenseits der Rayleigh-Länge z_R = π·w₀²/(M²·λ) linear an.",
    practice:
      "Infrarotstrahlen (808, 1064, 1550 nm) sind unsichtbar und lösen keinen " +
      "Lidschlussreflex aus – besonders gefährlich. Hier in Falschfarbe gezeigt.",
  },
  Plane: {
    title: "Virtuelle Messebene (Strahlprofil)",
    what: "Zeigt das Strahlprofil an der Position z – wie eine Kamera-Strahlprofilmessung.",
    physics:
      "Gemessen wird der 1/e²-Radius w(z). Mehrere Ebenen entlang z ergeben die Kaustik, " +
      "aus der man w₀, z_R und M² bestimmt (ISO 11146).",
    practice: "Ziehe die Ebene im 3D-Bild oder mit dem Regler durch den Fokus.",
  },
};

/** Measures required per laser class (simplified, after TROS Laserstrahlung). */
export const CLASS_INFO: Record<LaserClass, { risk: string; measures: string[] }> = {
  "1": {
    risk: "Unter vernünftigerweise vorhersehbaren Bedingungen ungefährlich.",
    measures: ["Keine besonderen Schutzmaßnahmen."],
  },
  "2": {
    risk:
      "Sichtbar, ≤ 1 mW. Kurzzeitige Bestrahlung (0,25 s) ist durch den Lidschlussreflex " +
      "geschützt – absichtliches Hineinblicken ist dennoch gefährlich.",
    measures: ["Nicht in den Strahl blicken.", "Strahl nicht auf Personen richten."],
  },
  "3R": {
    risk: "Direkter Blick in den Strahl kann das Auge schädigen (bis 5× Grenzwert Klasse 1/2).",
    measures: [
      "Laserschutzbeauftragte:r (LSB) bestellen.",
      "Direkte Bestrahlung der Augen vermeiden.",
      "Unterweisung der Beschäftigten.",
    ],
  },
  "3B": {
    risk: "Direkter Strahl und spiegelnde Reflexe sind für das Auge gefährlich, ggf. auch für die Haut.",
    measures: [
      "LSB bestellen, Laserbereich abgrenzen und kennzeichnen.",
      "Laserschutzbrille passend zu Wellenlänge und Leistung (EN 207).",
      "Schlüsselschalter, Interlock, Emissionsanzeige.",
      "Unterweisung vor Aufnahme der Tätigkeit, jährlich wiederholen.",
    ],
  },
  "4": {
    risk:
      "Auch diffuse Reflexe sind gefährlich; Haut- und Brandgefahr. Höchste Gefährdungsklasse.",
    measures: [
      "Alle Maßnahmen der Klasse 3B.",
      "Strahlengang möglichst vollständig einhausen, Strahlfallen nicht brennbar.",
      "Brandschutz, ggf. Absaugung von Prozessgasen.",
      "Zugang nur für befugte, unterwiesene Personen.",
    ],
  },
};

export interface Exercise {
  id: string;
  title: string;
  goal: string;
  hint: string;
  /** Applies only to these laser types (undefined = all). */
  only?: Array<"diode" | "dpss">;
}

export const EXERCISES: Exercise[] = [
  {
    id: "safe_start",
    title: "Sicher einschalten",
    goal:
      "Interlock geschlossen, Shutter geschlossen, Strom auf 0 – erst dann den " +
      "Schlüsselschalter (Emission) freigeben.",
    hint:
      "So kann beim Einschalten kein unkontrollierter Strompuls die Diode schädigen und " +
      "kein Strahl ungewollt austreten.",
  },
  {
    id: "threshold",
    title: "Laserschwelle finden",
    goal:
      "Strom langsam erhöhen, bis der Laser gerade anschwingt (Zustand LASING, Strom " +
      "höchstens 15 % über der Schwelle).",
    hint:
      "Unterhalb von I_th überwiegt spontane Emission (wie bei einer LED). An der Schwelle " +
      "gleicht die Verstärkung die Resonatorverluste aus – die P-I-Kennlinie knickt ab.",
  },
  {
    id: "temperature",
    title: "Temperatureinfluss beobachten",
    goal: "TEC-Sollwert um mindestens 8 K ändern und die Verschiebung von Schwelle und Wellenlänge ablesen.",
    hint:
      "I_th(T) = I_th,25 · exp((T − 25 °C)/T₀). Ein kleines T₀ bedeutet starke " +
      "Temperaturabhängigkeit. Halbleiter-Wellenlängen driften mit der Bandlücke.",
    only: ["diode"],
  },
  {
    id: "pump_tuning",
    title: "Pumpwellenlänge abstimmen",
    goal: "Bei mindestens 1 A Pumpstrom die TEC-Temperatur so einstellen, dass die Absorption ≥ 90 % beträgt.",
    hint:
      "Die 808-nm-Pumpdiode driftet mit ≈ 0,28 nm/K. Die Absorptionslinie von Nd:YVO₄ " +
      "liegt bei 808,5 nm und ist nur ≈ 2,5 nm breit. Achtung: Mehr Strom erwärmt die " +
      "Diode zusätzlich – der optimale Sollwert hängt vom Strom ab.",
    only: ["dpss"],
  },
  {
    id: "focus",
    title: "Strahl fokussieren und vermessen",
    goal:
      "Linse in den Strahl stellen und die Messebene in den Fokus schieben (innerhalb " +
      "der Rayleigh-Länge des Fokus).",
    hint:
      "Im Fokus ist der Radius minimal: w₀′. Innerhalb ±z_R′ wächst er höchstens um den " +
      "Faktor √2. Vergleiche w₀′ mit der Formel M²·λ·f/(π·w_L).",
  },
  {
    id: "telescope",
    title: "Strahl aufweiten (Teleskop)",
    goal:
      "Mit zwei oder mehr Linsen den Strahl mindestens 1,8-fach aufweiten (oder verkleinern), " +
      "sodass er hinter der letzten Linse kollimiert bleibt (z_R > 2 m).",
    hint:
      "Kepler: zwei Sammellinsen im Abstand f₁ + f₂, Vergrößerung f₂/f₁. Galilei: " +
      "Zerstreuungs- + Sammellinse im Abstand f₂ − |f₁| – kürzer, ohne Zwischenfokus. " +
      "Größerer Strahl → kleinere Divergenz und kleinerer Fokus danach.",
  },
  {
    id: "classify",
    title: "Laserklasse und Schutzbrille bestimmen",
    goal: "Bestimme die Laserklasse des Geräts und die mindestens nötige Schutzstufe (OD) im Quiz.",
    hint:
      "Die Klasse richtet sich nach der maximal zugänglichen Strahlung des Geräts – nicht " +
      "nach dem gerade eingestellten Strom.",
  },
  {
    id: "safe_stop",
    title: "Sicher ausschalten",
    goal: "Shutter schließen, Strom auf 0 herunterfahren, dann die Emission abschalten.",
    hint: "Abrupte Stromsprünge belasten die Diode. Der Treiber rampt den Strom zwar, gute Praxis bleibt aber: erst herunterregeln.",
  },
];

/** Context-sensitive explanation of what the device is doing right now. */
export function explainState(v: {
  state: string;
  current: number;
  threshold: number;
  shutter: boolean;
  junction: number;
  maxJunction: number;
  absorption?: number;
  kind: "diode" | "dpss";
  shg: boolean;
}): string[] {
  const out: string[] = [];
  switch (v.state) {
    case "INTERLOCK":
      out.push(
        "Der Interlock ist offen (z. B. Labortür). Die Emission ist gesperrt. Nach dem " +
          "Schließen muss die Emission bewusst neu freigegeben werden.",
      );
      break;
    case "FAULT":
      out.push(
        "Störung aktiv – der Treiber hat abgeschaltet. Ursache beheben (z. B. TEC kühler " +
          "einstellen, Strom reduzieren) und anschließend quittieren.",
      );
      break;
    case "OFF":
      out.push(
        "Emission gesperrt: Es fließt kein Diodenstrom. Gute Ausgangslage für Justage " +
          "und Umbau – trotzdem den Shutter geschlossen halten.",
      );
      break;
    case "ARMING":
      out.push(
        "Emissionsverzögerung läuft: Die Warnleuchte ist an, gleich kann Strahlung " +
          "austreten. Diese Zeit gibt allen im Raum die Chance, zu reagieren.",
      );
      break;
    case "ON":
      if (v.current > 0) {
        out.push(
          v.kind === "dpss" ?
            `Pumpstrom ${v.current.toFixed(0)} mA: Die Pumpdiode leuchtet, aber die ` +
              "absorbierte Pumpleistung reicht noch nicht für die Laserschwelle des Kristalls."
          : `Strom ${v.current.toFixed(0)} mA liegt unter der Schwelle ` +
              `I_th ≈ ${v.threshold.toFixed(0)} mA: nur spontane Emission (LED-Betrieb), ` +
              "breitbandig und ungerichtet.",
        );
      } else {
        out.push("Emission freigegeben, Strom auf 0. Jetzt den Strom langsam erhöhen.");
      }
      break;
    case "LASING":
      out.push(
        v.shg ?
          "Laserbetrieb mit Frequenzverdopplung: Die grüne Leistung steigt quadratisch " +
            "mit der 1064-nm-Grundwelle – kleine Stromänderungen wirken stark."
        : "Laserbetrieb: Oberhalb der Schwelle steigt die Leistung linear mit dem Strom " +
            "(Steigung = differentieller Wirkungsgrad).",
      );
      break;
  }
  if (v.state === "LASING" || v.state === "ON") {
    if (!v.shutter) {
      out.push(
        "Shutter geschlossen: Der Laser läuft, aber der Strahl wird blockiert. Der " +
          "Leistungsmesser zeigt ≈ 0 mW.",
      );
    } else if (v.state === "LASING") {
      out.push("Shutter offen: Der Strahl läuft über die Bank bis in den Leistungsmesser (Strahlfalle).");
    }
  }
  if (v.kind === "dpss" && v.absorption !== undefined && v.current > 300) {
    if (v.absorption < 80) {
      out.push(
        `Nur ${v.absorption.toFixed(0)} % des Pumplichts werden absorbiert – die ` +
          "Pumpwellenlänge liegt neben der Absorptionslinie. TEC-Sollwert anpassen.",
      );
    }
  }
  if (v.junction > v.maxJunction - 6) {
    out.push(
      `Sperrschicht ${v.junction.toFixed(1)} °C – nahe der Abschaltgrenze ` +
        `${v.maxJunction} °C. Strom reduzieren oder TEC kühler stellen.`,
    );
  }
  return out;
}

/** German, trainee-friendly description of an audit entry of the simulator. */
export function describeAction(action: string, details?: Record<string, unknown>): string {
  const msg = details?.["message"];
  if (typeof msg === "string") return msg;
  switch (action) {
    case "device_write": {
      const ch = String(details?.["channel"]);
      const val = details?.["value"];
      const onOff = (b: unknown) => (b === true || b === "true" ? "an/offen" : "aus/geschlossen");
      switch (ch) {
        case "current_set_mA":
          return `Sollstrom auf ${Number(val).toFixed(0)} mA gestellt.`;
        case "tec_set_C":
          return `TEC-Sollwert auf ${Number(val).toFixed(1)} °C gestellt.`;
        case "emission":
          return `Schlüsselschalter / Emission: ${onOff(val)}.`;
        case "shutter":
          return `Shutter ${val === true ? "geöffnet" : "geschlossen"}.`;
        case "interlock":
          return `Interlock ${val === true ? "geschlossen" : "geöffnet"}.`;
        case "fault_reset":
          return "Störung quittiert.";
        default:
          return `${ch} = ${String(val)}`;
      }
    }
    case "device_write_failed":
      return `Befehl abgelehnt: ${String(details?.["error"] ?? "")}`;
    case "connection_connect_requested":
      return "Verbindung zum Gerät angefordert.";
    case "connection_disconnected":
      return "Verbindung zum Gerät getrennt.";
    case "connection_created":
      return `Gerät „${String(details?.["name"] ?? "")}“ angelegt.`;
    case "lab_optics_changed":
      return `Optik geändert: ${String(details?.["summary"] ?? "")}`;
    case "lab_exercise_completed":
      return `Übung abgeschlossen: ${String(details?.["title"] ?? "")} ✓`;
    case "lab_quiz_answer":
      return `Quiz: ${String(details?.["summary"] ?? "")}`;
    default:
      return action;
  }
}
