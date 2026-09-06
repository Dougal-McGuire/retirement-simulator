# Ruhestandsplanung: Neustrukturierung

Der Nutzer verlangt eine deutlich neue Informationsarchitektur und Gestaltung bei Erhalt sämtlicher Funktionen. Die vorherige Konsolidierung war zu nah am bestehenden Dashboard.

## Struktur und Gestaltung

Vier Aufgabenbereiche: Überblick, Mein Plan, Zahlungsströme, Varianten. Desktop und iPad erhalten eine ruhige Seitennavigation; schmale Geräte eine kompakte Navigation mit denselben Zielen. Hauptfläche maximal 1200 px, großzügige Abstände, 15–16 px Lesetext, mindestens 44 px für primäre Touchziele. Dunkelpetrolfarbener Navigationsbereich, warme helle Arbeitsfläche, türkisfarbene Akzente. Keine dekorativen Bilder.

Überblick: große Ergebnisbotschaft mit expliziter Erfolgsdefinition, drei ergänzende Ergebniszahlen, Vermögensdiagramm mit erklärender Überschrift und vorhandenen Analysewerkzeugen. Ein kompakter Plansteckbrief verlinkt direkt auf passende Editorabschnitte. Die vier Schnellregler liegen in einem aufklappbaren Was-wäre-wenn-Bereich. Keine zweite Erfolgsplakette im Header und keine Mini-Empfehlungschips am Diagramm.

Mein Plan: thematische Schrittnavigation neben dem Editor (auf Mobilgeräten oberhalb), statt zwei übereinanderliegenden horizontalen Tabreihen. Alle bestehenden Eingaben, Vorlagen, Rücksetzen, Speichern, Validierung und Entnahmeregeln bleiben. Verbesserte Lesbarkeit und zurückhaltende Kartenkonturen.

Zahlungsströme: Jahresbilanz und Ausgabenanalyse mit Kontext, ohne sachfremde KPI-Leiste. Brutto/Netto/Steuern und Finanzierungslücken unverändert korrekt.

Varianten: klare Auswahl zwischen Was-wäre-wenn-Szenarien/Empfehlungen und Vergleich gespeicherter Pläne. Bestehende Berechnungen und Vergleichsaktionen wiederverwenden.

## Funktionszuordnung

- Planwechsel, Speichern, Neuberechnung: Arbeitskopf.
- Planverwaltung (neu/umbenennen/duplizieren/löschen), Konto/Sync, Sprache, PDF, Setup: beschriftetes Werkzeugmenü.
- Nominal/Kaufkraft: bei den Ergebnissen; reine Darstellungseinstellung.
- Schnellregler + erweiterte Annahmen + exaktes Zurücksetzen: optionaler Experimentbereich.
- Chart-Skalierung, Zoom, Einzeljahrinspektion, Datentabellen: erhalten.
- Empfehlungen und Strategie-/Planvergleich: Varianten.
- Sämtliche Planfelder und Zahlungsströme: thematischer Editor.
- Fehler, laufende Berechnung, veraltete Ergebnisse und ungespeicherte Änderungen: eindeutige Statusmeldungen.

## Umsetzung und Prüfung

Vorhandene Engine, Persistenz, Auth und Export bleiben bestehen. Neue Shell, Überblick und gemeinsame Aktionen; bestehende Fachkomponenten werden eingebunden und gezielt gestaltet. Keine neuen Datenmodelle oder Abhängigkeiten. Bisherige Browserprüfungen müssen der neuen Navigation folgen, nicht die alte Struktur erzwingen. Wesentliche Pfade: Plan ändern/speichern/wechseln, Regler zurücksetzen, Jahresbilanz, Vergleich, Menü vollständig im Viewport; Desktop/iPad/Mobil sowie Deutsch/Englisch. Separater PR und Vercel-Vorschau für das Redesign.
