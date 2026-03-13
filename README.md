# Kläppen SkiTracker

Unofficial SkiTracker for Kläppen Ski Resort with manual and GPS-based ride tracking, stats, achievements, and route tooling. Community-made by Kläppen enthusiasts.

Live: https://klappen.falkboman.se

Creators: Eric & Stefan FalkBoman

## Om projektet

Kläppen SkiTracker är ett litet webbprojekt för att logga åk i Kläppen, följa statistik för ett sällskap och experimentera med GPS-baserad spårning. Projektet består av en frontend i HTML/CSS/JavaScript och en enkel PHP-backend som läser och skriver JSON-filer i `Data/`.

Det här repot innehåller i praktiken tre delar:

- `index.html` + `app.js`: huvudappen för manuell registrering, grupphantering, statistik och kartval av backar
- `gps/`: nyare GPS-läge för att spela in ett pass och föra tillbaka rutten till huvudappen
- `gps-test/` och `gps-recorder/`: verktyg för GPS-definitioner, analys, testning och äldre inspelningsflöden

## Funktioner

- Skapa eller gå med i ett sällskap via gruppkod
- Logga åk manuellt per person, backe och datum
- Se statistik per person och för hela gruppen
- Få achievements, stjärnor och överblick per svårighetsgrad
- Välja backar direkt på pistkartan
- Spela in GPS-rutter och använda dem i huvudappen
- Hantera zonplaceringar för backar via adminläge
- Spara projektdata lokalt i JSON-filer utan databas

## Teknik

- HTML
- CSS
- JavaScript
- PHP
- JSON som datalager
- Tailwind via CDN
- Tom Select via CDN
- Leaflet via CDN i GPS-delarna

Ingen byggkedja krävs för att köra projektet lokalt.

## Kom igång lokalt

### Krav

- PHP 8.x rekommenderas
- En lokal miljö där du kan köra PHP:s inbyggda webbserver

### Starta projektet

Kör från projektroten:

```bash
php -S localhost:8000
```

Öppna sedan:

- `http://localhost:8000/` för huvudappen
- `http://localhost:8000/gps/` för GPS-läget
- `http://localhost:8000/gps-test/` för GPS-test och analysverktyg
- `http://localhost:8000/gps-recorder/` för inspelning/uppmappning av backar och liftar

Om du vill ange dokumentroten explicit kan du också köra:

```bash
php -S localhost:8000 -t .
```

## Varför PHP behövs lokalt

Projektet är inte bara statiska filer. Frontenden anropar `api.php` och `gps-test/api.php` för att:

- läsa backar, grupper, statistik och zoner
- skapa och uppdatera sällskap
- spara åk
- spara och analysera GPS-spår
- skriva uppdaterade JSON-filer i `Data/`

Att öppna `index.html` direkt i webbläsaren utan server räcker därför inte.

## Data och lagring

All data lagras lokalt i repot, främst i `Data/`.

Exempel på filer:

- `Data/backar.json`: metadata om backar
- `Data/liftar.json`: metadata om liftar
- `Data/back_zones.json`: koordinater för klickbara kartzoner
- `Data/groups.json`: index över sällskap
- `Data/groups/`: separata filer per sällskap för rides och stats
- `Data/gps_back_defs.geojson`: GPS-definitioner för backar
- `Data/gps_lift_defs.geojson`: GPS-definitioner för liftar

PHP-backenden använder fillåsning vid skrivningar för att minska risken för trasiga filer vid samtidiga uppdateringar.

## Viktiga vyer

### Huvudappen

Startsidan används för det vanliga flödet:

- välj eller skapa sällskap
- registrera åk
- se topplistor, statistik och avklarade backar
- välj backar via lista eller pistkarta

### GPS-läge

`/gps/` används för att spela in en hel rutt med mobilens geolocation-API. Rutten kan sedan skickas tillbaka till huvudappen och sparas därifrån.

Tips:

- bäst upplevelse är på mobil
- tillåt exakt platsinformation
- stäng av autolås under inspelning
- installerat hemskärmsläge/PWA-liknande användning är att föredra

### GPS-test

`/gps-test/` är ett mer tekniskt verktyg för att:

- analysera inspelade GPS-spår
- bygga och uppdatera back- och liftdefinitioner
- klassificera punkter och rutter
- spara testspår

### GPS Recorder (legacy)

`/gps-recorder/` är ett äldre inspelningsverktyg för att spela in specifika backar eller liftar för linjedefinitioner.

## Tester

Det finns ett enkelt PHP-testscript för GPS-logiken:

```bash
php gps-test/tests/run-tests.php
```

Testerna verifierar bland annat:

- normalisering av GPS-spår
- klassificering av punkt och rutt
- sparning av back- och liftspår
- deterministisk rebuild av definitioner

## Struktur

```text
.
├── index.html
├── app.js
├── api.php
├── app-loader.php
├── gps/
├── gps-test/
├── gps-recorder/
├── Data/
├── IMG/
└── manifest.webmanifest
```

## Utvecklingsnoteringar

- Projektet använder CDN:er för flera frontend-beroenden, så internetanslutning behövs normalt under körning.
- Eftersom data skrivs direkt till filer är detta främst ett lokalt eller småskaligt hobbyprojekt, inte en produktionssatt fleranvändarapp.
- Om du vill återställa data mellan testomgångar behöver du själv rensa eller byta ut relevanta JSON-filer i `Data/`.
- `app-loader.php` används för att servera `app.js` med enkel cachekontroll via ETag.

## Roadmap

- Spela in resterande backar och liftar med recordern så att GPS-underlaget blir mer komplett.
- Förbättra huvudvyn så att registrering och statistik för liftar blir en tydlig och naturlig del av appen.
- Knyta ihop GPS-läget bättre med liftflödet, eftersom liftdata i praktiken finns men ignoreras av GPS-läget just nu.
- Fortsätta stärka GPS- och API-logiken med fler tester när definitionerna blir mer kompletta.

## License

Projektet ligger i detta repo tillsammans med en [LICENSE](./LICENSE)-fil. Se den för exakta villkor.
