# Harmonogram bakalářské práce

---

## 1. Tvorba MCP serveru

| #  | Krok                                      | Náplň                                                                                                                                                                                                | Rozsah BP                                        |
|----|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| 1  | **Rešerše a analýza domény**              | Rešerše tvorby MCP serverů; průzkum existujících MCP serverů pro studijní plány / předměty / rozvrhy; pokusy o standardizaci API; analýza datových struktur InSIS; rozsah dat o vyučujících vč. GDPR | Plně                                             |
| 2  | **Definice a specifikace API**            | Návrh kontraktu MCP serveru; nástroje (tools), zdroje (resources), vstupy/výstupy, chybové stavy, verzování; definice smluv vůči AI klientovi                                                        | Plně                                             |
| 3  | **Návrh architektury a přístupu k datům** | Mapování entit InSIS na primitiva MCP; přístup k datům (Oracle *views* v `isis-db2`, příp. pomocná PostgreSQL DB); rozhodnutí ETL vs. přímé čtení; provozní architektura                             | Plně                                             |
| 4  | **Implementace jádra serveru**            | Jádro MCP serveru, transport, směrování, správa relací, konfigurace                                                                                                                                  | Plně                                             |
| 5  | **Implementace nástrojů nad daty**        | Nástroje pro předměty, studijní plány, rozvrhy, organizační strukturu (pracoviště), harmonogram akademického roku, údaje o vyučujících; progressive disclosure                                       | Plně                                             |
| 6  | **Bezpečnost a GDPR**                     | Autentizace/autorizace, rate limiting, minimalizace dat, dodržení rozsahu veřejného rozhraní InSIS, odkaz na osobu v InSIS místo citlivých údajů                                                     | Plně                                             |
| 7  | **Testování a evaluace**                  | Jednotkové a integrační testy, testy API (kontraktu), evaluace s reálným AI klientem; spotřeba tokenů, latence, splnění funkčních požadavků                                                          | Plně                                             |
| 8  | **Kontejnerizace a nasazení**             | Docker image, nasazení na `bpmcp.vse.cz`, CI/CD pipeline, konfigurace prostředí, denní synchronizace dat (~7:00)                                                                                     | Plně                                             |
| 9  | **Monitoring a provoz**                   | Instrumentace (metriky, logy), napojení na Zabbix, alerting, sledování dostupnosti a výkonu, provozní runbooky                                                                                       | Základ v BP, plné doladění v provozu             |
| 10 | **Údržba, dokumentace a předání**         | Uživatelská a provozní dokumentace, verzování, plán dlouhodobé údržby, reakce na změny schématu InSIS                                                                                                | Dokumentace v BP, dlouhodobá údržba nad rámec BP |

---

## 2. Časový harmonogram

| Období                 | Kroky serveru                                                                                            |
|------------------------|----------------------------------------------------------------------------------------------------------|
| **Červenec 2026**      | Úvodní schůzka k BP; dohoda na tématu a rozsahu; rozdělení na kroky, návrh struktury BP                  |
| **Srpen 2026**         | Zpracování podkladů ke všem bodům; upřesnění přístupu k datům (Ad 1-3); vedoucí připravil `bpmcp.vse.cz` |
| **Září 2026**          | Krok 1 rešerše + analýza domény                                                                          |
| **Říjen 2026**         | Krok 2 definice API; Krok 3 návrh architektury                                                           |
| **Listopad 2026**      | Krok 4 jádro; Krok 5 nástroje (start)                                                                    |
| **Prosinec 2026**      | Krok 5 nástroje (dokončení); Krok 6 bezpečnost/GDPR                                                      |
| **Leden 2027**         | Krok 7 testování a evaluace                                                                              |
| **Únor 2027**          | Krok 8 kontejnerizace a nasazení na `bpmcp.vse.cz`, CI/CD                                                |
| **Březen 2027**        | Krok 9 monitoring (Zabbix); Krok 10 dokumentace                                                          |
| **Duben 2027**         | Provozní doladění a stabilizace                                                                          |
| **Květen-Červen 2027** | Příprava prezentace a obhajoba                                                                           |

**Rezerva:** cca 3 týdny v dubnu 2027 (a i navíc v průběhu práce při splnění milníků dříve)
