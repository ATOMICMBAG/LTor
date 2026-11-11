# Changelog

## v0.3.0 — Linsenkette & Ein-Seiten-Layout

### Neu

- **Linsenkette:** bis zu fünf Linsen auf der optischen Schiene, einzeln im
  3D-Bild verschiebbar (ohne sich zu überholen). Formen bikonvex,
  plankonvex, Meniskus sowie Zerstreuungslinsen (bikonkav, plankonkav,
  Meniskus); Brennweiten 25–300 mm, nur physikalisch fertigbare
  Kombinationen.
- Echte 3D-Linsengeometrie aus der Linsenmacher-Gleichung (N-BK7, Ø 1″),
  Radien R₁/R₂ in der Oberfläche, Aperturwarnung bei zu großem Strahl.
- Vorlagen: Fokussieren, Kepler-Teleskop 1:3, Galilei-Teleskop 1:3,
  4f-Relay, leere Bank.
- Strahlrechnung Linse für Linse (q-Parameter): alle reellen Foki,
  Ausgangsstrahl, Taillenverhältnis, Kollimationserkennung.
- Übung „Strahl aufweiten (Teleskop)“, Physik-Selbsttest für Kepler,
  Galilei und Linsenmacher-Gleichung.

### Geändert

- **Laserlabor passt auf eine Seite:** „Optik auf der Bank“ ist ein Reiter
  der Kachel „Steuerung“, „Laserschutz“ und „Über diesen Laser“ sind Teil
  des Hilfebereichs. 3D-Ansicht und Diagramme bleiben beim Justieren
  sichtbar.

## v0.2.0 — Laserlabor & Online-Demo

### Neu

- **Laserlabor** (neues Modul): virtueller Laserplatz mit 3D-Optikbank
  (three.js, Modell aus Blender), bedienbarem Laser-Controller und
  physikalischem Modell für fünf Lasertypen – 405 nm GaN-Diode,
  808 nm Hochleistungsdiode, 1550 nm DFB, 1064 nm und 532 nm DPSS.
  - Schwellstrom nach T₀-Gesetz, Eigenerwärmung, Wellenlängendrift,
    Pumpabsorption (Nd:YVO₄), Frequenzverdopplung (P ∝ P²).
  - Gaußstrahl-Optik: Linse und Messebene im 3D-Bild verschiebbar, Kaustik
    w(z), Strahlprofil-Kamera, Fokus-Spitzenintensität.
  - Laserschutz live: Laserklasse, MPE, NOHD, Schutzbrillen-OD,
    Maßnahmen nach Klasse (vereinfacht nach IEC 60825-1 / TROS).
  - Sicherheitslogik wie am echten Gerät: Interlock ohne Wiederanlauf,
    Schlüsselschalter mit 3 s Emissionsverzögerung, Soft-Start,
    Übertemperatur-Abschaltung mit Quittierung, Taupunkt-Warnung.
  - Lernpfad für Auszubildende: Live-Erklärung des Zustands, sieben
    automatisch geprüfte Übungen inkl. Laserklassen-Quiz, Protokoll aller
    Aktionen, Bauteil-Infos per Klick.
- **Verbindungstyp `sim`** (Laser-Simulator) für Desktop und Web – ideal zum
  Entwickeln und Testen ohne Hardware.
- **Web-Backend** `server/` (WebSocket-JSON-RPC) mit Modus `demo`
  (öffentlich, private Sitzung pro Tab, nur Simulator) und `full`
  (eigener Laborserver).
- **Deployment-Paket** `deploy/`: Deploy-Skript, gehärtete systemd-Unit,
  Plesk-Apache/nginx-Anweisungen.
- `npm run test:physics`: Selbsttest der Physik gegen Lehrbuchwerte.

### Geändert

- RPC-Handler in `src/main/backend.ts` zusammengeführt – Electron und
  Web-Server nutzen denselben Code.
- `ProtocolManager` bekommt die Adapter-Fabrik injiziert; Adapter können
  Meldungen (`onNotice`) ins Audit-Log schreiben.
- WebSocket-Transport puffert Anfragen bis zum Verbindungsaufbau und setzt
  die Sitzung nach einem Reload fort.
- Web-Version öffnet direkt im Laserlabor.

## v0.1.0

- Erste Version: OPC UA, MQTT, REST, Telemetrie, Sensoren, Audit-Log.
