# Struktura bakalářské práce

---

## Název

Návrh a implementace MCP serveru pro zpřístupnění studijních dat VŠE AI agentům

## Úvod

Motivace, problém integrace AI <> IS, cíl práce, struktura textu

## 1. Integrační architektury a jejich evoluce

- Výměna dat mezi systémy
- Problém integrace IS a AI agentů
- Limity RAG a uzavřených systémů
- **Rešerše:** existující MCP servery pro studijní plány / předměty / rozvrhy; pokusy o standardizaci API ve vzdělávání

## 2. Model Context Protocol

*(popis protokolu samostatně od rešerše)*

- Původ a účel protokolu
- Architektura klient–server a transport
- Integrační primitiva: nástroje, zdroje, prompty
- Bezpečnostní model a rizika

## 3. Kontextové okno, tokeny a progressive disclosure

- Kontextové okno a tokenizace
- Náklady a latence předávání kontextu
- Progressive disclosure vs. hromadné dumpování

## 4. Analýza domény a požadavků

*(analytická část před realizací; datové struktury InSIS zde)*

- Doména studijní agendy VŠE a systém InSIS
- Zdroj dat: Oracle `isis-db2` (datové struktury, views, denní synchronizace)
- Rozsah dat o vyučujících a GDPR
- Funkční požadavky a případy užití
- Metodika evaluace

## 5. Návrh architektury

- Mapování entit InSIS na primitiva MCP
- Přístup k datům: přímé čtení z Oracle vs. pomocná DB
- Návrh nástrojů a progressive disclosure
- Provozní architektura a nasazení
- Slepé uličky a nečekané problémy

## 6. Implementace

- Jádro MCP serveru
- Implementace nástrojů
- Bezpečnost
- Testování
- Kontejnerizace, nasazení a CI/CD
- Instrumentace a monitoring

## 7. Evaluace a diskuse

- Datová propustnost a spotřeba tokenů
- Latence a odezva
- Matice splnění funkčních požadavků
- Diskuse: vhodnost MCP pro univerzitní IS
- Doporučení pro další výzkum

## Závěr

Shrnutí přínosu, splnění cílů, možnosti rozšíření

## Přílohy

Prohlášení k využití AI, zdrojové kódy / repozitář, doplňkové výstupy

## Literatura

Seznam citovaných zdrojů, normy, standardy, dokumentace InSIS, MCP
