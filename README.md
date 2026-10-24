# Harden

*Every set, on record.*

Web app (PWA) per registrare carichi e ripetizioni sulla scheda del coach, con timer di recupero, misure, peso, logbook PDF per il coach e report.
Funziona offline. I dati restano sul telefono e vengono sincronizzati in un file JSON di un repository GitHub **privato**.

## 1. Pubblica l'app su GitHub Pages

1. Crea un repository **pubblico**, per esempio `harden`. Contiene solo il codice, nessun dato.
2. Carica tutti i file di questa cartella mantenendo la struttura (`index.html`, `sw.js`, `js/`, `vendor/`, `icons/`…).
3. Vai su **Settings → Pages**, scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`, e salva.
4. Dopo un minuto l'app è online su `https://<tuo-utente>.github.io/harden/`.

## 2. Prepara il repository dei dati

1. Crea un repository **privato**, per esempio `harden-data`.
2. Carica il file `harden-data.json`, che contiene la scheda del ciclo 1 e la settimana 1.

## 3. Crea il token

1. GitHub → foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → scegli solo `harden-data`.
3. **Permissions → Repository permissions → Contents**: *Read and write*. Non serve altro.
4. Scegli una scadenza (per esempio 1 anno), genera il token e copialo.

Il token può leggere e scrivere solo quel repository. Resta salvato solo sul telefono e viaggia solo verso `api.github.com`.

## 4. Installa sull'iPhone

1. Apri l'indirizzo dell'app in **Safari**.
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Apri Harden dalla Home → **Collega GitHub** e inserisci utente, repository (`harden-data`), branch (`main`), file (`harden-data.json`) e token.
4. Tocca **Salva e prova la connessione**: l'app scarica i dati e parte dalla settimana 2.

## Come funziona la sincronizzazione

- Ogni serie viene salvata subito sul telefono, anche senza rete.
- Quando premi **Termina sessione** l'app sincronizza da sola con GitHub (un commit per sessione). Se sei offline resta in coda e parte appena torna la rete.
- Sincronizza anche quando salvi peso o misure, quando esci dall'app con modifiche in sospeso e quando la riapri.
- Se modifichi da due dispositivi, le modifiche vengono unite elemento per elemento: vince la versione più recente.

## Aggiornare l'app

Quando carichi una nuova versione dei file, cambia il numero in `VERSION` dentro `sw.js`. L'iPhone scarica l'aggiornamento in background e lo usa dall'apertura successiva.

## Nuova scheda del coach

Ogni 4-8 settimane: manda il PDF della scheda a Claude e fatti preparare il file della scheda (`.json`). Poi **Impostazioni → Cicli → Importa nuova scheda**. Il ciclo in corso viene chiuso ma resta consultabile e modificabile.
