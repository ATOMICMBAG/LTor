# maazi.de | LTor — Laser Tor

**Universelle Laborplattform für Lasersysteme & optische Messtechnik.**

LTor ist eine industriell gestaltete Desktop-Anwendung (Electron + React +
TypeScript), die heterogene Laborhardware – SPSen, Sensoren, Messgeräte – über
**OPC UA**, **MQTT** und **REST** in einer einheitlichen Oberfläche
zusammenführt, Telemetrie live darstellt, Kamera- und Mikrofon-Signale der
Workstation einbindet und alle sicherheitsrelevanten Vorgänge in einem
manipulationssicheren **Audit-Log** protokolliert.

Das Frontend ist **transport-agnostisch** aufgebaut: derselbe React-Code läuft
sowohl in der Electron-Desktop-App (lokal, direkt am Labor-PC) als auch im
Webbrowser gegen einen Remote-Backend-Server (z. B. VPS) – siehe Abschnitt
[Deployment-Varianten](#deployment-varianten).

---

[![gif](/media/1-5_LTor.gif)](/media/1-5_LTor.gif)

---

## Inhalt

- [Auf einen Blick](#auf-einen-blick)
- [Für Anwender:innen](#für-anwenderinnen)
  - [Installation](#installation)
  - [Erster Start](#erster-start)
  - [Module der Oberfläche](#module-der-oberfläche)
  - [Konfiguration pro Protokoll](#konfiguration-pro-protokoll)
  - [Tastaturbedienung & Bedienkonzept](#tastaturbedienung--bedienkonzept)
  - [Wo werden meine Daten gespeichert?](#wo-werden-meine-daten-gespeichert)
  - [Häufige Probleme](#häufige-probleme)
- [Für Entwickler:innen](#für-entwicklerinnen)
  - [Tech-Stack](#tech-stack)
  - [Projektstruktur](#projektstruktur)
  - [Voraussetzungen](#voraussetzungen)
  - [Setup & Skripte](#setup--skripte)
  - [Architekturüberblick](#architekturüberblick)
  - [IPC-Layer (Electron ↔ WebSocket)](#ipc-layer-electron--websocket)
  - [Eigenen Protokoll-Adapter schreiben](#eigenen-protokoll-adapter-schreiben)
  - [Neues UI-Modul anlegen](#neues-ui-modul-anlegen)
  - [Audit-Log: Format & Erweiterung](#audit-log-format--erweiterung)
  - [Deployment-Varianten](#deployment-varianten)
  - [Roadmap](#roadmap)
- [Lizenz](#lizenz)

---

## Auf einen Blick

| Bereich    | Kern                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| Plattform  | Windows / macOS / Linux (Electron)                                     |
| Protokolle | OPC UA (`node-opcua`), MQTT (`mqtt.js`), REST (`axios`)                |
| Sensoren   | Kamera & Mikrofon der Workstation (Web `MediaDevices` API)             |
| UI         | React + TypeScript + TailwindCSS, einklappbare Panels, modul-basiert   |
| Persistenz | Verbindungen → `connections.json`, Audit-Log → `audit.jsonl`           |
| Audit-Log  | Append-only JSON Lines, lückenlos, exportierbar                        |
| Transport  | Lokal: Electron-IPC (`window.ltor`) · Remote-fähig: WebSocket-JSON-RPC |

---

# Für Anwender:innen

## Installation

Aktuell liegt die App im Quellzustand vor; Binaries werden in einem späteren
Release-Schritt via `electron-builder` paketiert.

Lokal starten:

```bash
git clone <repo-url> LTor
cd LTor
npm install
npm run dev          # öffnet das Electron-Fenster
```

> **Hinweis:** `npm run dev` öffnet automatisch das Electron-Fenster. Daneben
> startet ein Vite-Dev-Server unter `http://localhost:5173/` – das ist nur ein
> Asset-Server für den Renderer und in dieser Konfiguration **nicht** zur
> direkten Browser-Benutzung gedacht (außer du betreibst zusätzlich ein
> Backend, siehe [Deployment-Varianten](#deployment-varianten)).

## Erster Start

Beim allerersten Start ist die Verbindungsliste leer. Empfohlener Ablauf:

1. **Sidebar → Verbindungen** öffnen.
2. Protokolltyp wählen (OPC UA / MQTT / REST), auf **Neu** klicken.
3. Formular ausfüllen (siehe [Konfiguration pro Protokoll](#konfiguration-pro-protokoll))
   und speichern.
4. In der Tabelle bei der Verbindung auf **Verbinden** klicken.
5. **Telemetrie**-Modul öffnen → Live-Werte erscheinen als Sparklines.
6. **Sensoren** (Kamera/Mikrofon) und **Audit-Log** verhalten sich
   selbsterklärend.

## Module der Oberfläche

| Modul        | Inhalt                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Übersicht    | Stat-Cards (verbundene Geräte, aktive Kanäle, Sensoren), kompakte Verbindungs-Status-Tabelle, jüngste Warnungen. |
| Telemetrie   | Live-Sparklines pro Kanal, Werteanzeige, Min/Max/Last, Pause-Funktion, Filter & Verbindungs-Auswahl.             |
| Verbindungen | CRUD für Verbindungen, pro Verbindung Connect/Disconnect/Edit/Delete. Formular je Protokolltyp.                  |
| Sensoren     | Bordeigene Kamera (Vorschau) und Mikrofon (RMS-Pegelmeter). Auswahl des Geräts, Start/Stopp.                     |
| Audit-Log    | Tabelle aller Ereignisse, Filter nach Kategorie/Zeitraum/Volltext, JSONL-Export, kompletter Reset.               |

## Konfiguration pro Protokoll

### OPC UA

- **Endpoint:** `opc.tcp://host:4840`
- **Security Mode:** `None`, `Sign`, `SignAndEncrypt`
- **Security Policy:** `None`, `Basic256Sha256`, `Aes128_Sha256_RsaOaep`,
  `Aes256_Sha256_RsaPss`
- **Benutzer/Passwort:** optional; leer = anonymous.
- **Publishing-Intervall (ms):** Subscriptions-Default für alle Nodes.
- **Datenpunkte:** eine Zeile pro Node im Format

  ```
  nodeId|kanalName
  ```

  Beispiel:

  ```
  ns=2;s=Demo.Static.Scalar.Double|temperatur
  ns=2;s=Demo.Dynamic.Scalar.Int32|count
  ```

### MQTT

- **Broker-URL:** `mqtt://`, `mqtts://` oder `ws://…` (Web-MQTT).
- **Client-ID / Benutzer / Passwort:** optional.
- **Topics:** eine Zeile pro Subscription:

  ```
  topic|kanalName|qos
  ```

  Beispiel:

  ```
  lab/+/temperatur|temperatur|0
  factory/#|allgemein|1
  ```

  Wildcards `+` und `#` werden unterstützt.

### REST

- **Base-URL:** z. B. `http://gateway.local:8000`
- **Methode:** GET / POST / PUT / PATCH / DELETE
- **Header:** zeilenweise `Key: Value`.
- **Polling-Endpoints:** zeilenweise

  ```
  pfad|kanalName|intervallMs|jsonPath
  ```

  `jsonPath` ist optional und bedient eine kleine Dollar-Subset-Syntax
  (`$.path.to.value`); leer = ganze Response wird verwendet.

  Beispiel:

  ```
  /api/sensor|temperatur|1000|$.value
  /api/health|status|5000|
  ```

## Tastaturbedienung & Bedienkonzept

- Alle Seitenpanels (Titlebar, Sidebar, Tools-Panel, Statusbar) sind über die
  kleinen Chevron-Buttons **einzeln ein-/ausklappbar**. Eingeklappte Panels
  hinterlassen schmale Rand-Toggles, mit denen sie wieder geöffnet werden.
- **DevTools** öffnen sich **standardmäßig nicht**. Aktivierung wahlweise per:
  - Flag: `npm run dev -- -- --devtools`
  - Env-Variable: `LTOR_DEVTOOLS=1`
  - Tastenkürzel im Fenster: `F12` bzw. `Ctrl + Shift + I`

## Wo werden meine Daten gespeichert?

LTor schreibt in das OS-typische `userData`-Verzeichnis:

| OS      | Pfad                                                              |
| ------- | ----------------------------------------------------------------- |
| Windows | `%APPDATA%\LTor\` (z. B. `C:\Users\<Name>\AppData\Roaming\LTor\`) |
| macOS   | `~/Library/Application Support/LTor/`                             |
| Linux   | `~/.config/LTor/`                                                 |

Dateien:

- `connections.json` – alle Verbindungen samt Konfiguration.
- `audit.jsonl` – ein JSON-Objekt pro Zeile, append-only.

Beide Dateien sind menschen-lesbar und können bei Bedarf gesichert oder
versioniert werden.

## Häufige Probleme

- **Im Browser-Tab `http://localhost:5173/` ist alles leer.** Das ist gewollt:
  der Tab ist nur Asset-Server für den Renderer. Nutze stattdessen das
  Electron-Fenster – oder stelle einen Remote-Backend bereit
  ([Deployment-Varianten](#deployment-varianten)).
- **App startet mit `ERR_REQUIRE_ESM: hexy`.** Sicherstellen, dass `npm install`
  die im `package.json` festgeschriebene Override `"hexy": "0.3.5"` aufgelöst
  hat (gefolgt von einem frischen `node_modules`-Build).
- **OPC-UA-Verbindung schlägt mit Zertifikatsfehler fehl.** Security Mode auf
  `None` setzen oder die UA-Server-Endpunkt-CA im OS-Trust-Store hinterlegen.
- **MQTT bleibt auf „verbindet …“ hängen.** Brokerseitig prüfen, ob die
  Client-ID nicht doppelt vergeben ist; bei `mqtts://` Zertifikate prüfen.
- **Mikrofon zeigt keinen Pegel.** Browser-/OS-Berechtigung erteilen,
  anschließend **Geräte neu laden** klicken.

---

# Für Entwickler:innen

## Tech-Stack

- **Electron 32**, **electron-vite 2** (Bundling für Main / Preload / Renderer).
- **TypeScript 5** (strict).
- **React 18** + **Zustand** (State).
- **TailwindCSS 3** + eigene Design-Tokens (`tailwind.config.js`, `index.css`).
- **Recharts** für Sparklines.
- **node-opcua 2.x** (OPC UA), **mqtt.js 5** (MQTT), **axios 1** (REST).
- **lucide-react** für Icons.

## Projektstruktur

```
src/
├── shared/                      # gemeinsame Typen (Connection, AuditEntry, IPC-Konstanten)
│   └── types.ts
│
├── main/                        # Electron Hauptprozess (Node)
│   ├── index.ts                 # Bootstrap, BrowserWindow, IPC-Handler
│   ├── audit/auditLog.ts        # JSONL Audit-Log (append-only)
│   ├── store/connectionStore.ts # Persistierung der Verbindungen
│   └── protocols/
│       ├── adapter.ts           # ProtocolAdapter-Interface + AdapterEmitter
│       ├── manager.ts           # Orchestriert mehrere Adapter parallel
│       ├── opcuaAdapter.ts      # OPC UA (Subscriptions + Write)
│       ├── mqttAdapter.ts       # MQTT (Wildcards + QoS)
│       └── restAdapter.ts       # REST (Per-Endpoint-Polling + jsonPath)
│
├── preload/                     # Context-Bridge
│   └── index.ts                 # exposeInMainWorld("ltor", api)
│
└── renderer/                    # React-UI (Vite)
    └── src/
        ├── App.tsx              # Layout, Modul-Routing, Event-Abos
        ├── main.tsx             # Entry, ReactDOM.render
        ├── index.css            # Tailwind-Basis + Design-Tokens
        ├── ipc/                 # Transport-Layer (Electron / WebSocket / null)
        │   ├── transport.ts     # LtorTransport-Interface
        │   ├── electronTransport.ts
        │   ├── wsTransport.ts   # WebSocket-JSON-RPC-Client
        │   ├── nullTransport.ts # Fallback, wenn kein Backend verfügbar
        │   └── index.ts         # ipc = resolveTransport()
        ├── store/               # Zustand-Stores (app/connections/telemetry/audit/sensors)
        ├── components/layout/   # TitleBar, Sidebar, StatusBar, ToolsPanel, PanelToggleBar
        ├── modules/             # Fachliche Module
        │   ├── dashboard/
        │   ├── connections/
        │   ├── telemetry/
        │   ├── sensors/
        │   └── audit/
        └── types/ipc.d.ts       # window.ltor Typdeklaration (für Electron)
```

## Voraussetzungen

- Node.js **≥ 20**
- npm **≥ 10**
- (Windows) Visual Studio Build Tools werden ggf. von `node-opcua` benötigt.

## Setup & Skripte

```bash
npm install               # 1× nach jedem Pull
npm run dev               # Watch-Mode, öffnet Electron-Fenster
npm run dev -- -- --devtools  # zusätzlich DevTools öffnen
npm run typecheck         # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json
npm run build             # Produktions-Bundles in out/{main,preload,renderer}/
npm run start             # Vorschau des Production-Builds (electron-vite preview)
```

## Architekturüberblick

LTor folgt der klassischen Electron-3-Prozess-Trennung:

```
 ┌────────────────────────────┐         ┌───────────────────────────┐
 │  Main-Prozess (Node)       │  IPC ⇄ │ Preload (Context-Bridge)  │
 │  - ProtocolManager         │         │ - exposeInMainWorld(ltor) │
 │  - OPC UA / MQTT / REST    │         └───────────────────────────┘
 │  - AuditLog (JSONL)        │                  ↑   window.ltor
 │  - ConnectionStore         │                  │
 └────────────────────────────┘                  │
                                                 │
                                  ┌──────────────┴───────────────────┐
                                  │  Renderer (React, Vite, Tailwind)│
                                  │  - Module + Layout-Shell         │
                                  │  - Zustand-Stores                │
                                  │  - ipc/* Transport-Abstraktion   │
                                  └──────────────────────────────────┘
```

- **Sicherheit:** `contextIsolation: true`, `nodeIntegration: false`,
  Sandbox-konform; ausschließlich die explizit im Preload exponierte
  `LtorApi`-Oberfläche ist im Renderer sichtbar.
- **Live-Daten:** Adapter pushen über `ProtocolManager.onSample` und
  `onStatus` zum Main-Prozess; dieser broadcastet via `webContents.send` an
  alle BrowserWindows.

## IPC-Layer (Electron ↔ WebSocket)

Der Renderer redet **niemals** direkt mit `window.ltor`, sondern stets über die
Abstraktion in `src/renderer/src/ipc/`:

```ts
import { ipc } from "../ipc";

await ipc.connections.list();
const off = ipc.connections.onTelemetry(sample => …);
```

`ipc/index.ts` löst zur Laufzeit den passenden Transport auf:

1. `window.ltor` vorhanden → **`ElectronTransport`** (Standard im Desktop-Modus).
2. `import.meta.env.VITE_LTOR_WS_URL` gesetzt → **`WebSocketTransport`** zur
   angegebenen URL (z. B. `wss://lab.example.com/ltor`).
3. Browser ohne Vite-Dev-Port → WebSocket zu `ws[s]://<host>/ltor` (Same-Host).
4. Sonst → **`NullTransport`**, der alle Calls mit verständlicher Fehlermeldung
   ablehnt; der UI-State (Loading/Error) zeigt das sauber.

Der aktuelle Modus wird unten rechts in der Statusbar als Badge dargestellt
(`Desktop`, `Remote`, `Offline`).

### WebSocket-Wire-Protokoll

Ein minimales JSON-RPC reicht. Ein eigenes Backend muss nur das implementieren:

```jsonc
// Request  (client → server)
{ "id": "<uuid>", "method": "connections.list", "params": [] }

// Response (server → client)
{ "id": "<uuid>", "ok": true,  "result": [/* Connection[] */] }
{ "id": "<uuid>", "ok": false, "error": "Connection not found" }

// Unaufgeforderte Events (server → client)
{ "event": "audit",     "payload": <AuditEntry> }
{ "event": "status",    "payload": { "connectionId": "...", "status": "connected" } }
{ "event": "telemetry", "payload": <TelemetrySample> }
```

Unterstützte Methoden spiegeln die `LtorTransport`-Schnittstelle wider
(`sys.info`, `audit.list/append/clear`,
`connections.list/create/update/delete/connect/disconnect/write`).

## Eigenen Protokoll-Adapter schreiben

1. **Konfig-Typ** in `src/shared/types.ts` hinzufügen (`type ConnectionKind`,
   Config-Interface, Union-Erweiterung des `Connection["config"]`).

2. **Adapter** in `src/main/protocols/<name>Adapter.ts` anlegen, der
   `ProtocolAdapter` implementiert und `AdapterEmitter` erweitert:

   ```ts
   export class FooAdapter extends AdapterEmitter implements ProtocolAdapter {
     readonly kind = "foo" as const;
     constructor(public readonly id: string, private cfg: FooConfig) { super(); }

     async connect(): Promise<void> {
       this.emitStatus("connecting");
       // …connect…
       this.emitStatus("connected");
       // bei jedem Sample:
       this.emitSample({ connectionId: this.id, channel: "x", value: 42, ts: Date.now() });
     }
     async disconnect(): Promise<void> { this.emitStatus("disconnected"); }
     async write(channel: string, value: number | string | boolean): Promise<void> { … }
   }
   ```

3. Im **ProtocolManager** (`src/main/protocols/manager.ts`) den neuen `kind`
   im `instantiate()`-Switch registrieren.

4. Im **Renderer** ein Formularfeld in `ConnectionForm.tsx` ergänzen und in
   `ConnectionsModule.tsx#endpointSummary` die Anzeige der wichtigsten
   Konfig-Eigenschaft.

5. Optional: Default-Werte in `defaultConfig()`.

## Neues UI-Modul anlegen

1. Datei `src/renderer/src/modules/<name>/<Name>Module.tsx` erstellen.
2. In `src/renderer/src/store/appStore.ts` das neue `ModuleId` ergänzen.
3. In `src/renderer/src/components/layout/Sidebar.tsx` einen `NAV`-Eintrag.
4. In `src/renderer/src/App.tsx` das Modul ins Routing (`activeModule === …`)
   einbauen.

State innerhalb des Moduls → eigener Zustand-Store in `store/`. Datenzugriff
ausschließlich via `ipc` (Transport-Abstraktion) – nie direkt über
`window.ltor`.

## Audit-Log: Format & Erweiterung

`audit.jsonl` ist eine **append-only**-Datei. Jeder Eintrag:

```jsonc
{
  "id": "01H…", // ULID (chronologisch sortierbar)
  "ts": 1731585032123, // ms epoch
  "category": "connection", // info | warning | alarm | sensor | connection | system
  "actor": "user", // user | system
  "action": "connection_created",
  "details": {
    /* frei strukturierbar */
  },
}
```

Schreibzugriff erfolgt ausschließlich über `AuditLog.append()` (oder den
IPC-Endpunkt `audit:append`). Manipulation an der Datei zerstört die
Lückenlosigkeits-Garantie und sollte im Produktivbetrieb durch OS-ACLs
verhindert werden.

Eine neue Kategorie:

1. In `src/shared/types.ts` zur Union `AuditEntry["category"]` hinzufügen.
2. Optional Filter im `AuditLogModule.tsx` ergänzen.

## Deployment-Varianten

### A) Desktop (Standard)

```bash
npm run build
# → out/main/, out/preload/, out/renderer/
# Verteilung als Electron-Bundle (electron-builder folgt später).
```

### B) Browser-Frontend gegen Remote-Backend (VPS)

Konzept: der bestehende Electron-Main wird in einen schlanken Node-Server
extrahiert, der das gleiche IPC-Protokoll via WebSocket bedient
(`src/renderer/src/ipc/wsTransport.ts` beschreibt das Wire-Format).

1. **Backend (eigenes Repo / `server/`):**
   - Express oder Fastify + `ws`.
   - Wiederverwendet `src/main/protocols/*` (sind reines Node) und
     `src/main/audit/*` 1:1.
   - Implementiert die in
     [WebSocket-Wire-Protokoll](#websocket-wire-protokoll) gelisteten
     Methoden + Events.

2. **Frontend bauen mit gesetzter Backend-URL:**

   ```bash
   VITE_LTOR_WS_URL=wss://lab.example.com/ltor \
   npx vite build --base=/                     \
     --config electron.vite.config.ts          \
     # (für reines Web-Deployment Vite-Config geringfügig anpassen,
     #  electron-Plugin entfällt)
   ```

3. **Hosting:** statisches `dist/`-Verzeichnis hinter Nginx ausliefern, das
   `/ltor` als WebSocket-Reverse-Proxy an den Node-Backend forwarded.

   Kamera/Mikrofon-Sensoren funktionieren unverändert, da sie
   browser-natives `MediaDevices` nutzen.

Der `NullTransport` sorgt dafür, dass das UI auch ohne erreichbares Backend
verständliche Fehlermeldungen statt Hänger zeigt.

## Roadmap

- **Phase 3:** KI-Assistenzen (Anomalie-Erkennung, Wartungs-Hints).
- **Phase 4:** MES-/ERP-Integration, multimodale Auswertungen.
- **Längerfristig:** electron-builder-Paketierung (Signiert), Plugin-API für
  Drittprotokolle, Mehrbenutzer-Rollen, persistente Telemetrie-Aufzeichnung.

---

## Lizenz

GNU General Public License 3
