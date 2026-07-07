# Event Hub — MVP

Sistem za zbiranje e-mail naslovov z upravljanjem dogodkov. Statični frontend + Vercel serverless API + Vercel KV (Redis).

## 📁 Struktura

```
index.html              javna stran (single/catalog/series prikaz, modal detajlov, sticky subscribe)
admin.html               admin panel (login, CRUD dogodkov, naročniki, nastavitve, uporabniki)
unsubscribe.html          self-service stran za odjavo od e-novic
_theme.css                skupna barvna paleta ("oneiro-dark"), deljena med _shared.css in admin.html/unsubscribe.html
_shared.css                javno-specifični stili (uvozi _theme.css + doda --radius/--font)
_shared.js                  skupna JS logika za javne strani
api/
  _lib.js                 skupne pomožne funkcije (CORS, JWT verify, rate limiting, normalizeRecord, pipelineHgetall)
  _kv.js                   centraliziran Upstash Redis klient
  setup.js                 enkratni seed (zažene se ENKRAT po deployu)
  subscribe.js              POST – prijava (?action=subscribe, privzeto) in odjava (?action=unsubscribe)
                              (rate limited: 5/uro/IP prijava, 10/uro/IP odjava)
  events.js                    GET – javni seznam dogodkov + nastavitve + oznake
  auth.js                       vse auth + user-management akcije v eni funkciji, routirano po ?action=
                                  (login / change-password / add-user / me / set-name /
                                   list-users / delete-user) — zadnji dve rezervirani za master
  admin/
    events.js                     GET/POST/DELETE – CRUD dogodkov (JWT zaščiteno, odprto tudi za editor)
    subscribers.js                  GET – seznam naročnikov (?format=csv za CSV izvoz) — admin/master only
    settings.js                       GET/PUT/POST/DELETE – nastavitve, ekipa, oznake
                                        (PUT/oznake admin/master only; ekipa odprta tudi za editor)
    upload-image.js                     POST – nalaganje slike dogodka (Vercel Blob, odprto tudi za editor)
    audit.js                              GET – dnevnik dejanj (admin/master only, ?limit=)
admin/
  audit.html                ločena stran za pregled dnevnika dejanj (izven glavne admin navigacije)
vercel.json              CORS headers, Content-Type za _theme.css/_shared.css/_shared.js
package.json              odvisnosti: @upstash/redis, @vercel/blob, bcryptjs, jsonwebtoken
```

**Opomba o `api/auth.js`**: Vercel Hobby plan dovoli največ 12 serverless funkcij na deployment. Sorodne akcije so združene v skupne datoteke z internim routingom po `?action=`/`?format=` query parametru namesto ločenih datotek: `auth.js` pokriva vse auth + user-management akcije (bilo prej tudi `admin/users.js`), `subscribe.js` pokriva prijavo in odjavo (bilo prej tudi `unsubscribe.js`), `admin/subscribers.js` pokriva seznam in CSV izvoz (bilo prej tudi `admin/export.js`). Projekt trenutno uporablja **8 od 12** dovoljenih funkcij — pri dodajanju novih endpointov v prihodnje uporabi isti vzorec (nov `case`/query-param v obstoječi sorodni datoteki namesto nove datoteke), razen kadar gre za resnično drugačen tip telesa zahteve (npr. `upload-image.js` ostaja ločen zaradi multipart/binary parsanja).

## 🚀 Postavitev (deploy)

### 1. Pripravi repozitorij
```bash
git init
git add .
git commit -m "Event Hub MVP"
# push na GitHub, nato poveži repo z Vercel (vercel.com/new)
```

### 2. Ustvari Upstash Redis bazo
**Vercel KV je bil ukinjen** — namesto tega gre projekt direktno preko Upstash (brez kreditne kartice, brezplačen nivo 256MB / 500.000 ukazov mesečno):

1. Ustvari račun na [upstash.com](https://upstash.com) (brez kartice)
2. **Create Database** → izberi Redis → izberi regijo, ki je geografsko blizu tvojemu Vercel deploymentu
3. V dashboardu baze poišči **REST API** sekcijo, kopiraj `UPSTASH_REDIS_REST_URL` in `UPSTASH_REDIS_REST_TOKEN`
4. V Vercel projektu pojdi na **Settings → Environment Variables** in ročno dodaj obe spremenljivki (Production + Preview + Development)

### 2b. Ustvari Vercel Blob storage (za nalaganje slik dogodkov)
Vključeno v brezplačni Hobby plan (1GB/mesec). V Vercel dashboardu: **Storage → Create Database → Blob**. Ko ustvariš in povežeš s projektom, Vercel avtomatsko doda `BLOB_READ_WRITE_TOKEN` env spremenljivko — ni je treba ročno dodajati.

### 3. Nastavi dodatne environment variables
V **Settings → Environment Variables** dodaj:

| Ime | Vrednost | Opis |
|---|---|---|
| `JWT_SECRET` | naključen dolg string (npr. `openssl rand -hex 32`) | za podpisovanje JWT žetonov |
| `SETUP_SECRET` | naključen string po izbiri | enkratni ključ za zagon `/api/setup` |

### 4. Deploy
```bash
vercel --prod
```
ali preprosto push na glavno vejo, če je repo povezan z Vercel.

### 5. Zaženi enkratni setup (seed uporabnikov)
Ko je stran live, pokliči (enkrat!):
```bash
curl -X POST https://tvoja-domena.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{"masterSecret":"VREDNOST_SETUP_SECRET_OD_ZGORAJ"}'
```

To ustvari 4 uporabnike z generičnim geslom `ChangeMe2024!`:
- `master` (lahko dodaja nove uporabnike)
- `admin1`, `admin2`, `admin3`

**Vsi morajo ob prvi prijavi zamenjati geslo** — to je vsiljeno avtomatsko.

⚠️ Po uspešnem zagonu setup endpoint priporočam zaščititi ali odstraniti (glej spodaj "Varnostne opombe").

### 6. Prijava v admin
Pojdi na `https://tvoja-domena.vercel.app/admin.html`, prijavi se z enim od zgornjih uporabnikov in generičnim geslom. Sledi pozivu za menjavo gesla.

## 🎨 Funkcionalnosti

- **3 načini prikaza** dogodkov (admin nastavitev, velja za celo stran): single (eventi naloženi en pod drugim), catalog (mreža kartic), series (časovnica)
- **4 barvni toni** vezani na posamezen dogodek (ne globalno): Oneiro Dark, Forest Dream, Ember Trance, Void
- **Modal detajlov** — klik na kartico (catalog/series) odpre podrobnosti v popup oknu
- **Ločeni prihodnji/pretekli dogodki** — pretekli prikazani zatemnjeno v ločeni sekciji
- **Sticky subscribe vrstica** na dnu zaslona, vedno dostopna ne glede na število dogodkov
- **Tip dogodka**: enkraten ali serija/ponavljajoč (badge na kartici)
- **Nalaganje slik** neposredno v admin panel (Vercel Blob) — ni več odvisnosti od zunanjih hotlink servisov (Google Drive, Imgur), ki nezanesljivo blokirajo prikaz na tujih straneh. Slike se samodejno pomanjšajo in pretvorijo v JPEG v brskalniku pred nalaganjem (max stranica 1600px, ~82% kakovost), kar drži velikost datotek enotno ne glede na izvorno ločljivost. Podpira pokončne in ležeče slike (max 10MB pred obdelavo). Kartice (catalog/series) prikazujejo slike obrezane na 16:9 za enoten grid izgled; podroben pogled (single mode, modal) pokaže celotno sliko brez obreza, ne glede na orientacijo.
- **Rate limiting** na subscribe/unsubscribe endpointih (5 oz. 10 poskusov/uro/IP) proti spam botom
- **Odjava od e-novic** (`/unsubscribe.html`) — self-service stran, kjer uporabnik vpiše svoj e-mail. Ker pošiljaš vabila ročno preko BCC (identično sporočilo vsem), je en sam unsubscribe link v podpisu dovolj za vse prejemnike — ni potrebe po osebnem tokenu na prejemnika. Če boš v prihodnje prešel na pravi email servis (Resend, SendGrid ipd.) s personaliziranim pošiljanjem, lahko nadgradimo na unikatne tokene za večjo varnost.
- **Vloge uporabnikov**: `master` (lahko dodaja/briše uporabnike), `admin` (CRUD dogodkov + nastavitve)
- **JWT seje**: 8h veljavnost, žeton v `localStorage`, preverjanje na vsakem zaščitenem API klicu
- **Vsiljena menjava gesla** ob prvi prijavi (`mustChangePassword` flag)
- **CSV izvoz** naročnikov z UTF-8 BOM (kompatibilno z Excel)
- **i18n**: trenutno samo slovenščina (lahko razširimo na EN po potrebi)

## 🔒 Varnostne opombe

1. **Gesla**: hashirana z bcrypt (12 rounds), nikoli shranjena ali prikazana v plaintext.
2. **JWT_SECRET**: mora biti dolg, naključen string — brez njega lahko kdorkoli ponaredi žetone.
3. **`/api/setup`**: po prvem zagonu je smiselno bodisi (a) zbrisati `api/setup.js` in redeployati, bodisi (b) zamenjati `SETUP_SECRET` env spremenljivko na nekaj neuporabnega — endpoint sam preveri `kv.exists('user:master')` in zavrne ponovni zagon, a dodatna previdnost ne škodi.
4. **CORS**: trenutno `Access-Control-Allow-Origin: *` — za produkcijo lahko v `vercel.json` omejiš na svojo domeno.
5. **Rate limiting na prijavo**: `/api/auth?action=login` je omejen na 10 poskusov/uro/IP proti brute-force napadom na gesla.
6. **CSV izvoz**: vrednosti, ki se začnejo z `=`, `+`, `-` ali `@` so zaščitene pred formula/CSV injection (spreadsheet aplikacije bi jih sicer lahko izvedle kot formulo).

## 🛠 Lokalni razvoj

```bash
npm install -g vercel
npm install
vercel dev
```
Vercel CLI bo povprašal za povezavo s KV bazo (lahko uporabiš isto produkcijsko ali ustvariš ločeno za dev).

## 📋 Naslednji koraki / ideje za V2

- Email potrditev (double opt-in) za GDPR skladnost
- Unsubscribe link v vsakem mailu (stran `/unsubscribe.html` že obstaja, treba jo je le linkati v BCC vabilih)
- Audit log (kdo je kaj spremenil)
- Preveriti/omejiti pravice vloge `editor` (trenutno ima enaka pooblastila kot `admin` na dogodkih/nastavitvah — glej CHANGELOG)

## 📝 CHANGELOG — pregled kode (04.07.2026)

Celovit pregled kode je odkril in odpravil naslednje:

**Popravljeni bugi:**
- `api/admin/events.js`: `tagThemes` ni bil na seznamu JSON-polj (za razliko od `api/events.js`), kar je pri urejanju dogodka v adminu tiho izbrisalo izbrane tematske oznake. Zdaj je seznam JSON-polj usklajen (in centraliziran v `_lib.js`).
- `events.html` in `team.html`: skeleton loader je bil zapisan kot JS predloga (`${...}`) izven `<script>` oznake, zato se je ob nalaganju za trenutek prikazala surova koda namesto animacije nalaganja.
- `admin.html`: gumbi za urejanje dogodka/člana ekipe (`onclick='fn(${JSON.stringify(...)})'`) so se pokvarili, če je besedilo vsebovalo narekovaj/apostrof — zdaj se dogodki/člani iščejo po ID-ju iz shranjenega seznama.
- `admin.html`: ob nalaganju strani se je admin vmesnik za trenutek prikazal tudi z že poteklim/neveljavnim žetonom, preden ga je prva API zahteva zavrnila — zdaj se žeton preveri pred prikazom vmesnika.
- `events.html`: lokalna kopija ikone globusa (`GLOBE_ICON`) je imela pokvarjeno SVG pot (drugačna od `index.html`) — posledica ročnega podvajanja iste kode na treh mestih.

**Varnost:**
- Dodan rate limiting na `/api/auth?action=login` (10 poskusov/uro/IP) — prej ga ni bilo.
- Dodana zaščita pred CSV/formula injection pri izvozu naročnikov.
- Dodan `escapeHtml()` na vse admin-vnešeno besedilo (naslovi, opisi, imena, bio), ki se izpisuje preko `innerHTML` na javnih straneh in v adminu — obramba v globino, tudi če se kdaj doda uporabnik z omejenimi pravicami.

**Poenotenje kode (lažje vzdrževanje):**
- `normalizeRecord()` je bila skoraj identično podvojena v 4 datotekah (in vzrok zgornjega tagThemes buga) — zdaj ena skupna implementacija v `api/_lib.js`.
- `handleSubscribe()` je obstajala v 4 verzijah (1 neuporabljena v `_shared.js` + 3 skoraj identične kopije po straneh) — zdaj ena skupna funkcija.
- Prikaz govorcev (speaker card HTML) je bil podvojen med `index.html` in `events.html` — zdaj skupna `renderSpeakerCards()` v `_shared.js`.
- `GLOBE_ICON` je bil podvojen v treh datotekah — zdaj ena konstanta v `_shared.js`.
- Neuporabljene (dead code) `skeletonCard`/`skeletonSingle`/`skeletonTeam` funkcije v `_shared.js` odstranjene.

### Dopolnitev (isti dan, po povratni informaciji)

**Popravljen bug:**
- `events.html`: v modalu je gumb "Preberi več" razkril polno besedilo, ne da bi skril skrajšan predogled nad njim, zato je bil začetek besedila viden dvakrat. `toggleCollapsible()` zdaj sprejme opcijski `previewId` parameter in predogled pravilno skrije.

**API konsolidacija** (Vercel Hobby dovoli 12 serverless funkcij, projekt jih je uporabljal 11/12):
- `subscribe.js` + `unsubscribe.js` → združena v `subscribe.js` (`?action=unsubscribe`)
- `admin/subscribers.js` + `admin/export.js` → združena v `admin/subscribers.js` (`?format=csv`)
- `admin/users.js` → prestavljen v `auth.js` (`?action=list-users` / `?action=delete-user`)
- Rezultat: **8/12** funkcij, 4 mesta prosta za prihodnjo rast (npr. Orbis iframe/postMessage integracija).

**Redesign sticky subscribe vrstice** (bila prej vedno vidna čez celo širino, brez možnosti strnitve):
- Zdaj ena skupna komponenta (`initSubscribeBar()` v `_shared.js`), injicirana v `#subscribe-bar-mount` na vseh treh javnih straneh — HTML markup ni več ročno podvojen.
- Prikaže se šele po ~400px scrolla (ne tekmuje s prvim vtisom ob prihodu na stran).
- Privzeto strnjena v tanek trak čez celo širino; klik razširi v poln obrazec.
- Po uspešni prijavi se trajno skrije za tega obiskovalca (`localStorage`), saj ni razloga vztrajno spraševati nekoga, ki je že naročen.

### Dopolnitev 2 — popravek regresije + upravljanje oznak prek UI

**Popravljena regresija:** prejšnja iteracija je preveč na široko uporabila `escapeHtml()` — poleg naslovov/imen (kjer je prav) je pokvarila tudi ročno vnesene `<a href>` povezave v opisih dogodkov, bio predavateljev/članov ekipe in kontakt polju. Escaping je zdaj odstranjen s teh "prostobesedilnih" polj (`description`, `bio`, `contact`), ostane pa na strukturiranih poljih (`title`, `name`, `role`, `location`), kjer HTML nikoli ni bil namenjen.

**Nova funkcionalnost — oznake dogodkov prek UI (Nastavitve → Oznake dogodkov):**
- Tipi dogodkov in teme niso več trdo kodirani v `_shared.js`, ampak shranjeni v `settings` (Redis) in urejani prek admina — dodajanje (ime → samodejni slug, npr. "Izventelesne izkušnje" → `izventelesne-izkusnje`, s podporo slovenskim šumnikom) in brisanje, brez dotikanja kode.
- Brisanje oznake, ki jo še uporablja kak dogodek, sproži opozorilo s točnim številom prizadetih dogodkov (dogodki sami ostanejo nedotaknjeni — le prikaz pade nazaj na surov ID).
- Vsa brisanja v adminu (dogodek, član ekipe, uporabnik, oznaka) imajo potrditveno okno — preverjeno, obstajala so že za prve tri, dodano za oznake.
- Panel "Nastavitve" je razdeljen na 4 zložljive kartice (Način prikaza — privzeto odprt, Vsebina strani, Oznake dogodkov, Ekipa); besedilo v nogi premaknjeno takoj za hero besedilo.
- Panel "Naročniki" ločuje administrativni del (checkbox za zbiranje imena, izvoz CSV, kopiranje e-mailov) od seznama naročnikov spodaj.

### Dopolnitev 3 — poglobljen pregled + omejitev vloge editor

**Najdeno in popravljeno pri samo-reviziji:**
- `jsdom` je po nesreči ostal v `package.json` kot produkcijska odvisnost (ostanek testiranja) — odstranjeno.
- `initTagPickers()` v adminu ni uporabljala `escapeHtml()` na imenu oznake — popravljeno.
- Če je admin med urejanjem dogodka (z že izbranimi oznakami) dodal/izbrisal oznako v Nastavitvah, se je picker obnovil in izgubil vizualni prikaz "izbrano" (podatek je ostal pravilen, prikaz ne) — popravljeno, rebuild zdaj ohrani izbrano stanje.

**Vloga `editor` zdaj dejansko omejena** (prej je bila v praksi enakovredna `admin`):
- SME: CRUD dogodkov, upravljanje ekipe, nalaganje slik.
- NE SME: spreminjati nastavitve strani, upravljati oznake (dodajanje/brisanje), dostopati do seznama naročnikov/CSV izvoza — vse to je zdaj na backendu vrnjeno kot 403 za `editor`, v adminu pa so ustrezni deli UI zanjo/zanj skriti (`settings-card-mode`, `settings-card-content`, `settings-card-tags`, `subscribers-tab-btn`).
- Upravljanje uporabnikov (`add-user`/`list-users`/`delete-user`) ostaja rezervirano izključno za `master`.

**Odprto in namerno pustljeno kot je (ni bug, je odločitev):**
- Podvojene barvne CSS spremenljivke med `admin.html` in `_shared.css` (admin ima namenoma ločen CSS, ker javne strani nosijo veliko nepotrebnega za dashboard).
- N+1 poizvedbe proti Upstashu (`Promise.all` + posamični `hgetall` na 4 mestih) — pri trenutnem obsegu neopazno, pri večji rasti bi kazalo preiti na `kv.pipeline()`.

### Dopolnitev 5 — nove funkcionalnosti (6 faz)

**Faza 1 — deep-link, deljenje, koledar** (`events.html`, `index.html`, `_shared.js`):
- `events.html?id=<id>` samodejno odpre modal tega dogodka (deljiva povezava); `history.pushState` posodablja URL ob odpiranju/zapiranju, `popstate` podpira nazaj/naprej v brskalniku.
- Gumb "Deli": `navigator.share()` na mobilnem, kopiranje povezave v odložišče na namizju.
- Gumb "Dodaj v koledar": generira `.ics` datoteko (RFC5545, s pravilnim escapingom) ali odpre Google Calendar. Privzeto trajanje dogodka (če ni eksplicitno navedeno) je `DEFAULT_EVENT_DURATION_HOURS = 2` v `_shared.js` — spremeni na enem mestu.

**Faza 2 — admin: iskanje/filter, podvoji dogodek** (`admin.html`):
- Iskalno polje (naslov/lokacija) + filter po statusu (objavljeno/osnutek) nad seznamom dogodkov.
- Gumb "Podvoji" prekopira dogodek (brez ID-ja in datuma, naslov dobi pripono "(kopija)", status ostane osnutek).

**Faza 3 — samodejni predlogi za govorce** (`admin.html`):
- Lahka rešitev brez novega imenika: predlogi (`<datalist>`) iz vseh govorcev, ki so bili kdaj vneseni v katerem koli dogodku, deduplicirani po imenu. Izbira predloga predizpolni vlogo/bio/sliko/link — a samo v prazna polja, nikoli ne prepiše že vnesenega za ta konkretni dogodek.

**Faza 4 — Dashboard** (`admin.html`, nov privzeti zavihek "Pregled"):
- Število objavljenih/osnutkov, naslednji objavljen dogodek s štetjem dni do njega (`formatCountdown()` — računa po koledarskih dneh, ne po surovih 24-urnih blokih, da "jutri ob 9h" ne pokaže napačno kot "danes"), skupno naročnikov (skrito za `editor`).

**Faza 5 — dnevnik dejanj (audit log)**:
- `logAudit(who, action, target)` v `_lib.js` — vsaka administratorska sprememba (dogodek, nastavitve, oznake, ekipa, uporabniki) doda vnos v Redis seznam, omejen na `AUDIT_LOG_MAX_ENTRIES = 500` (starejši se samodejno odstranijo).
- Nov endpoint `api/admin/audit.js` (GET, admin/master only — dejanja `editor`-ja se beležijo, a jih sam ne vidi).
- Ločena stran `/admin/audit.html` (izven glavne admin navigacije, dostopna prek povezave v vznožju "Pregled" kartice), plus kratek predogled zadnjih 5 vnosov na dashboardu.

**Faza 6 — pošiljanje vabil (pripravljeno, čaka na API ključ)**:
- `sendEmail(to, subject, html)` v `_lib.js` — izolirana funkcija za Resend; če `RESEND_API_KEY`/`RESEND_FROM_EMAIL` nista nastavljena v Vercel env spremenljivkah, vrne jasno sporočilo namesto skrivnostne napake. Zamenjava ponudnika kadarkoli v prihodnje = sprememba te ene funkcije.
- Gumb "📧 Pošlji vabilo" pri vsakem dogodku (samo admin/master) pošlje e-mail vsem naročnikom (BCC, v paketih po `EMAIL_CHUNK_SIZE = 45` naslovov na klic).

### Dopolnitev 6 — testiranje pošiljanja brez API ključa + UX popravki

**Predogled vabila brez API ključa:** gumb "👁 Predogled" pri vsakem dogodku sestavi popolnoma enak predmet/HTML kot pravo pošiljanje (isti event lookup, ista predloga), le da nikoli ne pokliče Resenda — v modalu (iframe) pokaže točno, kako bi e-pošta izgledala, in koliko naročnikov bi jo prejelo. Deluje brez kakršnegakoli API ključa.

**Popravljeni bugi:**
- Vnosna polja za dodajanje novih oznak (tipi/teme) in iskalno polje nad seznamom dogodkov niso bila zavita v `.field` razred, zato so padla nazaj na privzet svetel videz brskalnika namesto temne teme. CSS pravilo razširjeno na vsa polja znotraj `main.content`, ne le tista v `.field` — ista napaka se ne more več ponoviti pri prihodnjih dodatkih.
- `#login-screen` je bil edini glavni zaslon v adminu brez privzetega `display:none` (za razliko od `#app` in `#change-pw-screen`) — zato je ob vsakem svežem nalaganju `admin.html` (npr. ob vrnitvi z ločene strani dnevnika) za trenutek bliskal prijavni obrazec, preden je preverjanje žetona sploh steklo. Dodano nevtralno "Nalagam..." stanje, prikazano dokler preverjanje ni zaključeno.
- Povezava do dnevnika dejanj je uporabljala `target="_blank"`, zato se je pri vsakem odpiranju ustvaril nov zavihek (kopičenje zavihkov pri ponovnih obiskih). Odstranjeno — zdaj se odpre v istem zavihku.

**UX izboljšave**:
- Vsi `confirm()` pozivi brskalnika (brisanje dogodka/člana/uporabnika/oznake, pošiljanje vabila) zamenjani z lastnim modalom (`showConfirmModal()`), skladnim z videzom strani.
- Dashboard: namesto predogleda dnevnika dejanj zdaj prikazuje "Zadnji dodani dogodki" (zadnji 3, klik odpre urejanje), z diskretno (manj vpadljivo) povezavo na poln dnevnik dejanj spodaj namesto prejšnjega izpostavljenega seznama.

### Dopolnitev 4 — N+1 poizvedbe in CSS podvajanje

**N+1 poizvedbe odpravljene:** dodan `pipelineHgetall()` v `_lib.js`, ki namesto N posamičnih HTTP klicev proti Upstashu (`Promise.all(ids.map(id => kv.hgetall(...)))`) uporabi en sam pipeline klic. Uporabljeno na vseh 4 mestih, kjer se je pojavljalo: `api/events.js`, `api/admin/events.js`, `api/admin/subscribers.js`, `api/auth.js` (seznam uporabnikov).

**CSS podvajanje odpravljeno:** nova skupna datoteka `_theme.css` z osnovno barvno paleto ("oneiro-dark"), ki jo zdaj uvozita `_shared.css` (javne strani) in neposredno povežeta `admin.html` ter `unsubscribe.html` (ki je imela isto podvajanje, a ni bila prej omenjena). Vsaka datoteka obdrži le svoje specifične vrednosti kot lokalen override (`--radius`/`--font` za javne strani, `--danger`/`--radius` za admin, `--danger` za unsubscribe) — vizualno se ni spremenilo ničesar, paleta se zdaj le ne more več po nesreči razhajati med datotekami.
