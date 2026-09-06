# Neustrukturierung der Ruhestandsplanung

Diese Überarbeitung ersetzt das kompakte Dashboard durch einen neuen Arbeitsbereich mit vier Aufgaben: Überblick, Mein Plan, Zahlungsströme und Varianten. Seitennavigation, Arbeitskopf, Ergebnisbotschaft, Lebensphasen und Plansteckbrief geben den Informationen eine neue Hierarchie. Der Planeditor erhält eine eigene thematische Navigation. Schnellregler bleiben als optionaler Experimentbereich direkt erreichbar.

Alle Eingaben, Berechnungen, Diagrammwerkzeuge, Tabellen, Planaktionen, Konto-/Sprachfunktionen, Export, Szenarien und Vergleich bleiben erhalten. Die vereinfachte Rentenbrücken-Kurzzeile wird durch die explizite Anzeige von aktuellem Alter, Ruhestart, erstem Rentenbeginn und Planungshorizont ersetzt. Konkrete Empfehlungen sind bei den Varianten direkt anwendbar. Die globale Eurodarstellung betrifft weiterhin nur Ergebnisse; der Plansteckbrief benennt ausdrücklich die Ausgangswerte.

Prüfung: 711 Unit-Tests erfolgreich. Vollständiger Browserlauf mit 54 Fällen: 53 erfolgreich, ein veralteter Test erwartete den alten Buttontext „Rechnen“. Nach Anpassung an „Neu berechnen“ und zwei Accessibility-Korrekturen sind alle 15 betroffenen Browserfälle erfolgreich. Die automatisierte GitHub-Pipeline prüft vor Veröffentlichung erneut den vollständigen Satz. Desktop-/Tablet- und Mobilansicht visuell geprüft. Die Menüposition wurde separat korrigiert und bereits live kontrolliert.

Unabhängige Gegenprüfung: vertikale Tastaturnavigation sowie Scroll-/Fokuswechsel bei Editor-Verknüpfungen nachgebessert und mit Browserprüfungen abgesichert. Keine Änderung an Engine, gespeicherten Plandaten, Steuerformeln oder PDF-Schnittstellen.

Ansichten: [Überblick](images/workspace-overview.png), [Planeditor](images/workspace-editor.png), [Mobil](images/workspace-mobile.png).

ESLint, TypeScript und Produktionsbuild sind erfolgreich.
