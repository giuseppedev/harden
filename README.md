# Harden

*Every set, on record.*

Web app (PWA) per iPhone che registra carichi e ripetizioni sulla scheda del coach. Comprende timer di recupero, peso e circonferenze, il logbook in PDF per il coach, un report tra cicli e le rate del coaching.
Funziona offline. I dati restano sul telefono e vengono sincronizzati in un file JSON di un repository GitHub **privato**.

## Le sezioni

| Tab | A cosa serve |
|---|---|
| **Home** | Promemoria (peso, circonferenze, token, rata del coaching), sessione in corso o prossima scheda da iniziare, sessioni della settimana, aderenza al ciclo, peso, ultimi record e ultime sessioni. Usa sempre il ciclo in corso. |
| **Scheda** | Ciclo scelto, con il menu ⋯ per creare un ciclo nuovo, chiuderlo o riaprirlo. **Programma**: esercizi per scheda e settimana, dettaglio con target, regolazioni e note del coach, modifica della scheda. **Sessioni**: sessioni del ciclo divise per settimana, da aprire e correggere, e inserimento di una sessione passata. |
| **Misure** | Peso (sempre con due decimali, indicando la bilancia usata) e 8 circonferenze. Grafici per giorno, settimana, mese o anno, storico ed export PDF. |
| **Logbook** | Il foglio del coach, una pagina per scheda (ogni 4 settimane per i cicli più lunghi), ed export PDF. |
| **Report** | Confronto tra i cicli scelti: progressione dei carichi, volume per distretto, peso e circonferenze a inizio e fine. |
| **⚙︎ Impostazioni** | Sincronizzazione, atleta e attrezzatura (bilancieri, dischi), catalogo esercizi, pagamento coaching, backup. |

La **sessione** si apre a schermo intero. In alto ci sono settimana, data e avanzamento, poi una card per esercizio con serie, storico delle ultime due volte, regolazioni, serie extra e nota. Le azioni meno frequenti (sostituisci, storico e progressione, recupero, note del coach) stanno nel menu ⋯ della card. Cambiare data o settimana ed eliminare la sessione si fa dal menu ⋯ in alto.

## 1. Pubblica l'app su GitHub Pages

1. Crea un repository **pubblico**, per esempio `harden`. Contiene solo il codice, nessun dato.
2. Carica tutti i file mantenendo la struttura (`index.html`, `sw.js`, `styles.css`, `js/`, `vendor/`, `icons/`…).
3. Vai su **Settings → Pages**, scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`, e salva.
4. Dopo un minuto l'app è online su `https://<tuo-utente>.github.io/harden/`.

## 2. Prepara il repository dei dati

1. Crea un repository **privato**, per esempio `harden-data`.
2. Carica il file `harden-data.json` iniziale, oppure lascia che l'app lo crei alla prima sincronizzazione.

## 3. Crea il token

1. GitHub → foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → scegli solo `harden-data`.
3. **Permissions → Repository permissions → Contents**: *Read and write*. Non serve altro.
4. Scegli una scadenza (per esempio 1 anno), genera il token e copialo.

Il token può leggere e scrivere solo quel repository. Resta salvato solo sul telefono e viaggia solo verso `api.github.com`. Se il repository risulta pubblico, l'app rifiuta il collegamento.

## 4. Installa sull'iPhone

1. Apri l'indirizzo dell'app in **Safari**.
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Apri Harden dalla Home → **Collega GitHub** e inserisci utente, repository (`harden-data`), branch (`main`), file (`harden-data.json`), token, scadenza del token e nome del dispositivo.
4. Tocca **Salva e prova la connessione**: se il file esiste, l'app scarica i dati.

## Sincronizzazione

- Ogni serie viene salvata subito sul telefono, anche senza rete.
- La sincronizzazione con GitHub parte da sola:
  - quando termini una sessione;
  - quando salvi peso, misure o una rata;
  - quando modifichi la scheda;
  - quando l'app passa in background con modifiche in sospeso;
  - quando la riapri.

  Se sei offline resta in coda.
- Ogni sincronizzazione è un commit in formato Conventional Commits, per esempio `feat: log session A week 2 (2026-10-26)`, con `Device: …` nel corpo del commit. Se non è cambiato niente, il commit non viene fatto.
- Se modifichi da due dispositivi, le modifiche vengono unite elemento per elemento: vince la versione più recente. Le eliminazioni sono segnate, non cancellate, così si possono annullare e unire.
- In alto compare un'etichetta solo quando serve: da sincronizzare, offline, errore, GitHub non collegato.

## Promemoria

Ogni promemoria ha una scadenza.
- Qualche giorno prima compare in arancione con il conto alla rovescia ("scade tra 2 gg", "scade domani", "scade oggi").
- Dopo la scadenza compare in rosso con i giorni passati ("scaduto da 3 gg").

| Promemoria | Scadenza | Arancione da |
|---|---|---|
| Peso | 3 giorni dopo l'ultima pesata | 1 giorno prima |
| Circonferenze | 7 giorni dopo l'ultima misurazione | 3 giorni prima |
| Rata del coaching | 30 giorni dopo l'ultima rata | 3 giorni prima |
| Token GitHub | data di scadenza inserita | 15 giorni prima |

Dove compare:
- **In Home**: come chip.
- **Nelle sezioni**: un pallino sul tab Misure (peso, circonferenze) e sull'icona ⚙︎ (token, rata). Nella sezione il conto colorato si aggiunge alla riga che mostra già la data. Il token scaduto ha anche un banner rosso, perché la sincronizzazione si ferma.
- **Sessione rimasta aperta** dal giorno prima: all'apertura l'app chiede se terminarla o riprenderla.

## Cose utili da sapere

- **MAV**: delle serie MAV conta solo l'ultima, che precompila il carico delle serie di lavoro. Il blocco MAV non va nel logbook.
- **Sostituzioni**: dal menu ⋯ dell'esercizio, solo per oggi o fino a fine ciclo. Lo schema si eredita o si modifica, uguale per tutte le settimane o diverso per ciascuna. Nel logbook il sostituto ha una riga sua.
- **Varianti**: un esercizio può avere varianti progressive, impostate in Catalogo, una per riga (per esempio i leg raise: a terra, alla sbarra a ginocchia flesse, ecc.). In sessione scegli quella che fai, già proposta con l'ultima usata. Nello storico compare accanto alle serie, nel logbook sotto il nome ("S1 a terra · S2-3 alla sbarra, ginocchia flesse").
- **Serie** scritte come ripetizioni × kg, per esempio `3×45 kg`. I carichi sono sempre solo dischi: con un bilanciere l'app mostra il totale e i dischi per lato.
- **Record**: una serie più pesante di tutte le precedenti di quell'esercizio viene segnata PR.
- **Grafici**: ogni vista mostra un periodo del calendario e le frecce vanno al periodo prima o dopo.
  - **Giorno**: i giorni di una settimana.
  - **Settimana**: le settimane di un mese.
  - **Mese**: i mesi dell'anno.
  - **Anno**: 5 anni.

  Ogni pallino ha valore e data. I punti arancioni sono pesate fatte su un'altra bilancia.
- **Annulla**: sessioni, pesate, misure, rate, programmi, bilancieri ed esercizi si eliminano con un tocco e si possono ripristinare per qualche secondo. Anche sostituire o ripristinare un esercizio si può annullare.
- **Scheda già fatta**: se tocchi una scheda già terminata in quella settimana, l'app chiede se rivederla o iniziarne una nuova.

## Export

| Export | Dove | File |
|---|---|---|
| Logbook del ciclo | Logbook → Esporta PDF | `Logbook ciclo 1 - 2026-10-25.pdf` |
| Misure e peso | Misure → Esporta PDF | `Misure e peso - 2026-10-25.pdf` |
| Backup completo | Impostazioni → Backup → Esporta dati | `harden-data-2026-10-25.json` |

Entrambi i PDF riportano la data in cui sono stati generati. Il PDF delle misure contiene le ultime circonferenze con la loro data e il peso degli ultimi 7 giorni. Le pesate fatte su un'altra bilancia sono segnate con l'asterisco.
L'import di un backup unisce il file ai dati del telefono.

## Nuova scheda del coach

Ogni 4-8 settimane:
1. Manda il PDF della scheda a Claude e fatti preparare il file della scheda (`.json`, `type: "gymlog-program"`).
2. Importalo da **Scheda → ⋯ → Nuovo ciclo dalla scheda del coach**, scegliendo la data di inizio.

Il ciclo in corso continua fino alla data di inizio della scheda nuova e quel giorno si chiude da solo. Resta consultabile e modificabile.
Gli esercizi nuovi entrano nel catalogo, quelli già presenti vengono riconosciuti per nome.

## Limiti di iOS

- Con lo schermo bloccato o l'app in background il bip di fine recupero non suona, e iOS non supporta la vibrazione. Il timer resta giusto, perché salva l'ora di fine: lo vedi alla riapertura. Durante la sessione l'app tiene lo schermo acceso.
- Dopo un aggiornamento la nuova versione arriva in background: chiudi l'app del tutto e riaprila, a volte due volte. In fondo alle Impostazioni vedi la versione in uso.

## Aggiornare l'app

A ogni rilascio:
1. Cambia `APP_VERSION` in `js/core.js` e `VERSION` in `sw.js`.
2. Se aggiungi un file JavaScript, aggiungilo anche alla lista `SHELL` in `sw.js`, altrimenti offline non c'è.
3. Fai girare i test: `node --test tests/logic.test.mjs`.
4. Usa Conventional Commits (`feat:`, `fix:`, …).

## Struttura del codice

JavaScript con moduli ES, senza build. Le viste generano HTML come stringhe e gli eventi sono delegati sul documento: ogni vista registra i suoi handler.

```
index.html            shell: header, contenuto, timer + tab, modali
styles.css            stile unico, tema chiaro/scuro, font di sistema
sw.js                 service worker: cache dell'app, aggiornamento in background
js/app.js             router, header, wiring degli eventi, avvio
js/core.js            stato UI, helper, toast, modali, menu, export, sync, registri degli handler
js/data.js            store locale (localStorage), merge per elemento, soft delete
js/github.js          sincronizzazione con l'API Contents di GitHub
js/logic.js           logica pura: date, schede, target, storico, logbook, report, grafici
js/pdf.js             PDF del logbook e delle misure (pdf-lib in vendor/)
js/timer.js           timer di recupero e wake lock dello schermo
js/charts.js          grafici a periodi e sparkline
js/views/dashboard.js Home
js/views/session.js   sessione, sostituzioni, storico esercizio, bilancieri e dischi
js/views/program.js   Scheda (programma, sessioni, editor, import, cicli)
js/views/measures.js  Misure
js/views/report.js    Report
js/views/logbook.js   Logbook
js/views/settings.js  Impostazioni, catalogo, backup
js/views/payments.js  Pagamento coaching
js/reminders.js       scadenze dei promemoria: chip, pallini, conto dei giorni
tests/logic.test.mjs  test della logica e del merge (node --test)
```

## Dati (`harden-data.json`)

Un solo documento con queste raccolte. Ogni elemento ha `id`, `updatedAt` ed eventualmente `deleted`.

- `cycles`: numero, inizio, settimane, schede (A–D) con esercizi, blocchi (serie e ripetizioni per settimana, MAV), recupero, superset, note e video del coach, sostituzioni definitive.
- `sessions`: ciclo, scheda, settimana, data, fine. Per ogni esercizio: serie (ripetizioni, carico, fatta, ora), serie extra, bilanciere, variante, nota, eventuale sostituzione.
- `exercises`: nome, distretto, bilanciere, regolazioni, varianti.
- `bars`: bilancieri e loro peso.
- `weights`: data, kg, bilancia (`home` o `other`).
- `measurements`: data e circonferenze in cm.
- `plans`: programmi del coaching, numerati, con inizio, fine, costo e numero di rate.
- `payments`: rate pagate, con programma, data e importo.
- `profile`: nome dell'atleta, dischi disponibili.

La configurazione di GitHub, il token e lo stato del timer restano in `localStorage` del telefono e non vanno nel file dei dati.
