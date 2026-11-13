# Harden

*Every set, on record.*

Web app (PWA) per iPhone che registra carichi e ripetizioni sulla scheda del coach. Comprende timer di recupero, peso e circonferenze, il logbook in PDF per il coach, un report tra cicli e le rate del coaching.
Funziona offline. I dati restano sul telefono e vengono sincronizzati in un file JSON di un repository GitHub **privato**.

## Le sezioni

| Tab | A cosa serve |
|---|---|
| **Home** | Promemoria (peso, circonferenze, token, rata del coaching), sessione in corso o prossima scheda da iniziare, sessioni della settimana, peso, ultimi record e ultime sessioni. Usa sempre il ciclo in corso. |
| **Scheda** | Ciclo scelto, con il menu ⋯ per creare un ciclo nuovo, chiuderlo o riaprirlo. **Programma**: esercizi per scheda e settimana, dettaglio con target, regolazioni e note del coach, modifica della scheda. **Sessioni**: sessioni del ciclo divise per settimana, da aprire e correggere, e inserimento di una sessione passata. |
| **Misure** | Peso (sempre con due decimali, indicando la bilancia usata) e 8 circonferenze. Grafici per settimana, mese, trimestre, anno o tutto, storico ed export PDF. |
| **Logbook** | Il foglio del coach, una pagina per scheda (ogni 4 settimane per i cicli più lunghi), ed export PDF. |
| **Report** | Confronto tra i cicli scelti: progressione dei carichi, volume per distretto, peso e circonferenze a inizio e fine. |
| **⚙︎ Impostazioni** | Sincronizzazione, atleta e attrezzatura (bilancieri, dischi), catalogo esercizi, pagamento coaching, backup. |

La **sessione** si apre con le sezioni sempre visibili in basso, così puoi passare a Misure o Report e tornare con "Riprendi la sessione". In alto ci sono settimana, data e avanzamento (la barra avanza a ogni serie spuntata, avvicinamenti del MAV esclusi; un esercizio conta come fatto quando tutte le sue serie sono spuntate, e allora il suo badge diventa una spunta verde), poi una card per esercizio con regolazioni, note del coach e video (da aprire), storico delle ultime 6 volte con ciclo e settimana (scorre di lato), serie, serie extra e nota. Le azioni meno frequenti (sostituisci, storico e progressione) stanno nel menu ⋯ della card. Il recupero parte da solo quando spunti una serie; "Termina sessione" è in fondo, dopo l'ultimo esercizio; finché non hai spuntato nessuna serie al suo posto c'è "Annulla sessione", per una sessione aperta per sbaglio. Modificare una sessione già terminata non cambia la sua durata. Cambiare data o settimana ed eliminare la sessione si fa dal menu ⋯ in alto.

Con una sessione in corso, in Scheda, Misure, Logbook e Report compare sopra i tab la barra **Riprendi la sessione**, che riporta all'allenamento nel punto in cui eri. In Home c'è già la card della sessione in corso. Durante l'allenamento, il riquadro in alto mostra anche l'ora di inizio. A fine allenamento il **riepilogo** mostra ora di inizio, ora di fine, durata (da "Inizia" a "Termina sessione") , poi le serie fatte, gli eventuali record e la serie migliore di ogni esercizio confrontata con l'ultima volta. Se la sessione è stata aperta più di 2 ore prima della prima serie, si parte dalla prima serie; se è stata chiusa più di 2 ore dopo l'ultima (per esempio il giorno dopo), ci si ferma all'ultima.

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

- **MAV**: delle serie MAV conta solo l'ultima. Le serie di lavoro dopo il MAV partono dai valori della volta precedente e non cambiano mentre scrivi il MAV. Il blocco MAV non va nel logbook.
- **Sostituzioni**: dal menu ⋯ dell'esercizio, solo per oggi o fino a fine ciclo. Lo schema si eredita o si modifica, uguale per tutte le settimane o diverso per ciascuna. Nel logbook il sostituto ha una riga sua.
- **Varianti**: un esercizio può avere varianti progressive, impostate in Catalogo, una per riga (per esempio i leg raise: a terra, alla sbarra a ginocchia flesse, ecc.). In sessione scegli quella che fai, già proposta con l'ultima usata. Nello storico compare accanto alle serie, nel logbook sotto il nome ("S1 a terra · S2-3 alla sbarra, ginocchia flesse").
- **Serie** scritte come ripetizioni × kg, per esempio `3×45 kg`. I carichi sono sempre solo dischi: con un bilanciere l'app mostra il totale e i dischi per lato.
- **Record**: è record un carico mai sollevato prima, oppure un carico già fatto con più ripetizioni di sempre a quel peso o a pesi maggiori (10×100 dopo 8×100 sì; 8×90 dopo 10×100 no). La prima volta su un esercizio non è un record. Per ogni esercizio, in una sessione c'è al massimo un PR: va sulla serie migliore (più pesante, poi più ripetizioni). Il messaggio compare una volta sola.
- **Precompilazione**: ripetizioni e carichi propongono quelli dell'ultima volta. Il target della scheda resta accanto ed è usato solo per un esercizio mai fatto.
- **Grafici**: in alto scegli il periodo: **S** (una settimana da lunedì a domenica; il peso si apre qui), **M** (un mese), **3M** (un trimestre di calendario), **A** (un anno) o **Tutto**. Sotto ci sono il periodo esatto ("Ottobre 2026") e quanto è lontano da oggi ("mese scorso", "3 settimane fa"); le frecce vanno al periodo prima o dopo. L'asse dei giorni è già diviso per tutto il periodo e ogni valore cade nel suo giorno, così i vuoti si vedono. In S e M ogni punto è un giorno, in 3M una settimana, in A un mese; Tutto sceglie da solo in base a quanto storico c'è. Per il peso un punto che raccoglie più valori è la loro media, per i carichi di un esercizio è il migliore. A destra c'è la scala dei valori, sul grafico sono scritti solo il minimo e il massimo. Sopra c'è il riassunto del periodo: la media (per un esercizio il carico migliore) e la variazione dal primo all'ultimo valore. Per leggere gli altri punti tocca il grafico, oppure tieni il dito e scorri di lato: in alto compaiono giorno e valore del punto sotto il dito. Ritocca lo stesso punto per tornare al riassunto. Uno scorrimento in verticale fa scorrere la pagina come sempre. Il grafico si apre sul periodo con il dato più recente. I punti arancioni sono pesate fatte su un'altra bilancia.
- **Ordine dello storico**: segue il programma, cioè ciclo, poi settimana, poi data. Una sessione della settimana 1 registrata in ritardo resta prima della settimana 2, sia nello storico della card sia nel precompilato. Ogni voce indica ciclo e settimana ("C1 S2"); se l'esercizio era in un'altra scheda, c'è anche la scheda ("C1 S2 scheda C").
- **Annulla**: sessioni, pesate, misure, rate, programmi, bilancieri ed esercizi si eliminano con un tocco e si possono ripristinare per qualche secondo. Anche sostituire o ripristinare un esercizio si può annullare.
- **Scheda già fatta**: se tocchi una scheda già terminata in quella settimana, l'app chiede se rivederla o iniziarne una nuova.

## Export

| Export | Dove | File |
|---|---|---|
| Logbook del ciclo | Logbook → Esporta PDF | `Logbook ciclo 1 - 2026-10-25.pdf` |
| Misure e peso | Misure → Esporta PDF → scegli il giorno | `Misure e peso - 2026-10-25.pdf` (data del giorno scelto) |
| Backup completo | Impostazioni → Backup → Esporta dati | `harden-data-2026-10-25.json` |

Entrambi i PDF riportano la data in cui sono stati generati. Il PDF delle misure si riferisce al giorno scelto (di default oggi): le circonferenze più recenti fino a quel giorno, con la loro data, e il peso dei 7 giorni che finiscono lì. Le pesate fatte su un'altra bilancia sono segnate con l'asterisco.
L'import di un backup unisce il file ai dati del telefono.

## Nuova scheda

Ogni 4-8 settimane, da **Scheda → ⋯ → Nuovo ciclo dalla scheda del coach** (o dalla Home a ciclo chiuso), scegli il **PDF della scheda**. L'app lo legge sul telefono, anche offline, e ti guida:
1. **Scheda letta**: schede, esercizi, settimane, giorni consigliati e data di inizio del ciclo, più il confronto con il catalogo.
2. **Un esercizio alla volta**, scheda per scheda: già nel catalogo (verde), con un nome simile da collegare (arancione, con la percentuale di somiglianza) oppure nuovo (viola, da aggiungere al catalogo). Serie×ripetizioni per settimana, MAV, recupero (− / + e tempi rapidi), TUT, note e video sono già compilati e si possono correggere.
3. **Riepilogo** di tutte le schede, con il salto a qualsiasi esercizio, e "Crea il ciclo".

Collegare un nome simile fa continuare lo storico, i record e i carichi precompilati di quell'esercizio. Se chiudi l'app a metà, l'import resta in Scheda con "Riprendi l'import". Le date vengono per prime: se il nuovo ciclo si sovrappone a quello in corso, l'app chiede di chiudere il ciclo in corso il giorno prima e di far partire il nuovo dal primo giorno libero (il giorno dopo l'ultima sessione registrata, se la data del PDF cade prima). Le sessioni già registrate restano nel loro ciclo, che da quel momento finisce in quella data. Il nuovo ciclo non può mai iniziare prima dell'ultima sessione registrata.
Funziona anche con un file `.json` di Harden (`type: "gymlog-program"`), che passa dagli stessi passaggi. Il PDF viene letto con pdf.js (in `vendor/pdfjs/`, licenza Apache 2.0), caricato solo quando scegli un PDF, e non lascia il telefono.

## Limiti di iOS

- Con lo schermo bloccato o l'app in background il bip di fine recupero non suona, e iOS non supporta la vibrazione. Il timer resta giusto, perché salva l'ora di fine: lo vedi alla riapertura. Durante la sessione l'app tiene lo schermo acceso.
- Dopo un aggiornamento la nuova versione arriva in background: chiudi l'app del tutto e riaprila, a volte due volte. In fondo alle Impostazioni vedi la versione in uso.

## Aggiornare l'app

A ogni rilascio:
1. Cambia `APP_VERSION` in `js/core.js` e `VERSION` in `sw.js`.
2. Se aggiungi un file JavaScript, aggiungilo anche alla lista `SHELL` in `sw.js`, altrimenti offline non c'è.
3. Fai girare i test: `node --test tests/*.test.mjs`.
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
js/pdfimport.js       lettura del PDF della scheda (pdf.js in vendor/pdfjs/)
js/timer.js           timer di recupero e wake lock dello schermo
js/charts.js          grafici su asse dei tempi e sparkline
js/views/dashboard.js Home
js/views/session.js   sessione, sostituzioni, storico esercizio, bilancieri e dischi
js/views/program.js   Scheda (programma, sessioni, editor, cicli)
js/views/import.js    import guidato della scheda
js/views/measures.js  Misure
js/views/report.js    Report
js/views/logbook.js   Logbook
js/views/settings.js  Impostazioni, catalogo, backup
js/views/payments.js  Pagamento coaching
js/reminders.js       scadenze dei promemoria: chip, pallini, conto dei giorni
tests/logic.test.mjs  test della logica e del merge (node --test)
tests/pdfimport.test.mjs  test della lettura del PDF, su una pagina finta
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
