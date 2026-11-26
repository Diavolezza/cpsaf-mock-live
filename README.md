# CPSA-F Probeklausur live / CPSA-F mock exam live

Web-Anwendung, mit der eine Gruppe die iSAQB-CPSA-F-Beispielprüfung gemeinsam durchgeht – auf Deutsch oder Englisch.

- **Teilnehmende** (Handy oder Laptop) öffnen den Link oder scannen den QR-Code, beantworten die aktuelle Frage und geben sie ab. Nach der Auflösung sehen sie die richtige Lösung neben ihrer Antwort und ihre Punkte; am Ende ihr Gesamtergebnis. Kein Konto, keine Namen.
- **Trainer** (Beamer) starten die Sitzung, sehen die Frage und wie viele abgegeben haben, lösen auf (mit Verteilung der Antworten), schalten weiter, überspringen Fragen, machen Pause. Am Ende gibt es eine anonyme Auswertung.

Bewertung nach den iSAQB-Prüfungsregeln (siehe `js/scoring.js`):

| Typ | Regel |
|---|---|
| A (Einfachauswahl) | richtige Antwort = volle Punkte; keine, falsche oder mehrere Antworten = 0 |
| P (Mehrfachauswahl, „pick n“) | je richtiges Kreuz +Punkte/n, je falsches −Punkte/n; mehr Kreuze als n = 0 |
| K (zeilenweise Zuordnung) | je richtige Zeile +Punkte/Zeilen, je falsche −Punkte/Zeilen, leere Zeile 0 |

Keine Frage geht unter 0. Bestanden ab 60 % der Punkte der gestellten (nicht übersprungenen) Fragen.

## Demo ohne Einrichtung

`trainer.html?demo=1` öffnen, Sitzung anlegen, den Teilnahme-Link in weiteren Tabs desselben Browsers öffnen. Jeder Tab ist ein Teilnehmer; alle Daten bleiben im Browser (localStorage). Solange `js/config.js` keine Firebase-Konfiguration enthält, läuft die Anwendung immer im Demo-Modus.

## Aufbau

- Statische Seiten (kein Build-Schritt), ausgeliefert über **GitHub Pages**: `index.html` (Teilnehmer), `trainer.html` (Trainer).
- Gemeinsamer Zustand in der **Firebase Realtime Database** (kostenloser Spark-Tarif, bis 100 gleichzeitige Verbindungen). Zugriffsregeln: `database.rules.json`.
- Anmeldung: Teilnehmende anonym (automatisch), Trainer mit **GitHub**.
- Fragen: YAML-Dateien in `exams/`, verzeichnet in `exams/index.json`.
- Bibliotheken liegen in `js/vendor/` (Firebase SDK 13.4.0 als ein Modul gebündelt, js-yaml, qrcode-generator).

### Daten in der Datenbank

```
sessions/{code}             owner, catalog, lang, createdAt, state {phase, index, qkey, skipped, resume}
participants/{code}/{uid}   joinedAt
presence/{code}/{uid}       true, solange verbunden
answers/{code}/{uid}/{qkey} a ("0,2" bzw. "01-0"), t
trainers/{uid}, admins/{uid}, trainerRequests/{uid}
```

Ein Teilnehmer kann nur die gerade offene Frage beantworten, nur einmal und nur, solange abgestimmt wird – das prüfen die Regeln auf dem Server.

## Fragen ergänzen

Neue Datei in `exams/` anlegen (Format siehe Kopf von `exams/cpsa-f-mock-2026.2.yaml`) und in `exams/index.json` eintragen. `npm test` prüft alle Kataloge (genau eine richtige Antwort bei A, `pick` passt zur Zahl der richtigen Antworten bei P, beide Sprachen vorhanden, …). Die Anweisungszeile („Wählen Sie aus den folgenden fünf Antworten die drei …“) erzeugt die Anwendung selbst.

## Einrichtung (einmalig)

### 1. Firebase-Projekt

1. <https://console.firebase.google.com> → **Projekt hinzufügen** (Google Analytics nicht nötig).
2. **Build → Realtime Database → Datenbank erstellen**, Standort **Belgien (europe-west1)**, im **gesperrten Modus** starten.
3. Reiter **Regeln**: Inhalt von `database.rules.json` einfügen → **Veröffentlichen**.
4. **Build → Authentication → Jetzt starten**, Reiter **Anmeldemethode**:
   - **Anonym** aktivieren.
   - **GitHub** aktivieren. Firebase zeigt eine **Callback-URL** (`https://<projekt>.firebaseapp.com/__/auth/handler`) – kopieren, Fenster offen lassen.
5. **Authentication → Einstellungen → Autorisierte Domains**: `diavolezza.github.io` hinzufügen.
6. **Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps → Web-App hinzufügen** (`</>`), Name z. B. „cpsaf-mock-live“, ohne Hosting. Das angezeigte `firebaseConfig`-Objekt in `js/config.js` eintragen (statt `null`).

### 2. GitHub-OAuth-App (für die Trainer-Anmeldung)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Application name: `CPSA-F Probeklausur`
   - Homepage URL: `https://diavolezza.github.io/cpsaf-mock-live/`
   - Authorization callback URL: die Callback-URL aus Schritt 1.4
2. **Register application**, dann **Generate a new client secret**.
3. Client ID und Client Secret in Firebase beim GitHub-Anbieter eintragen → **Speichern**.

### 3. Erster Admin

1. `https://diavolezza.github.io/cpsaf-mock-live/trainer.html` öffnen, **Mit GitHub anmelden**. Die Seite meldet „noch nicht freigeschaltet“ – dabei entsteht ein Eintrag unter `trainerRequests/<uid>`.
2. Firebase-Konsole → Realtime Database → **Daten**: die `<uid>` aus `trainerRequests` kopieren und anlegen:
   - `admins/<uid>` = `true`
   - `trainers/<uid>` → `name` = Ihr Name, `login` = GitHub-Name
   - den Eintrag unter `trainerRequests` löschen.
3. Trainer-Seite neu laden. Weitere Trainer melden sich einfach mit GitHub an; ihre Anfrage erscheint in der Trainer-Ansicht des Admins unter **Anfragen für Trainer-Zugang** → **Freischalten**.

### 4. GitHub Pages

Repository → **Settings → Pages** → Source **Deploy from a branch**, Branch `main`, Ordner `/ (root)`.

## Entwicklung und Tests

```bash
npm install
npm test             # Bewertung und Fragenkataloge
npm run test:rules   # Zugriffsregeln gegen den Firebase-Emulator (braucht Java)
npm run serve        # http://localhost:8000/trainer.html?demo=1
```

Mit `?emu=1` verbindet sich die Seite mit lokalen Firebase-Emulatoren (`npx firebase emulators:start --project demo-cpsaf`). Die GitHub Action `Tests` führt beide Testsätze bei jedem Push aus.

## Quelle

Fragen und Lösungen: **International Software Architecture Qualification Board e. V. (iSAQB® e. V.)**, Beispielprüfung CPSA-F®, Version 2026.2. Laut iSAQB darf die Beispielprüfung unter Angabe des iSAQB als Quelle und Copyright-Inhaber in Schulungen eingesetzt, zur Prüfungsvorbereitung genutzt und unentgeltlich weitergegeben werden; der Einsatz in echten Prüfungen ist untersagt. In der englischen Fassung wurden vier offensichtliche Abweichungen zur deutschen Fassung korrigiert (Fragen 1, 9, 25, 37).
