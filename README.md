# Sentria Events — MVP

Sistem za zbiranje e-mail naslovov z upravljanjem dogodkov. Statični frontend + Vercel serverless API + Vercel KV (Redis).

## 📁 Struktura

```
index.html              javna stran (single/catalog/series prikaz, modal detajlov, sticky subscribe)
admin.html               admin panel (login, CRUD dogodkov, naročniki, nastavitve, uporabniki)
unsubscribe.html          self-service stran za odjavo od e-novic
api/
  _lib.js                 skupne pomožne funkcije (CORS, JWT verify, rate limiting)
  _kv.js                   centraliziran Upstash Redis klient
  setup.js                 enkratni seed (zažene se ENKRAT po deployu)
  subscribe.js              POST – shrani email naročnika (rate limited: 5/uro/IP)
  unsubscribe.js              POST – odjava po e-mail naslovu (rate limited: 10/uro/IP)
  events.js                    GET – javni seznam dogodkov + nastavitve
  auth.js                       vse auth akcije v eni funkciji, routirano po ?action=
                                  (login / change-password / add-user / me / set-name)
  admin/
    events.js                     GET/POST/DELETE – CRUD dogodkov (JWT zaščiteno)
    subscribers.js                  GET – seznam naročnikov za UI
    settings.js                       GET/PUT – način prikaza, vsebina strani
    export.js                           GET – CSV izvoz naročnikov
    users.js                              GET/DELETE – upravljanje uporabnikov (master only)
    upload-image.js                         POST – nalaganje slike dogodka (Vercel Blob)
vercel.json              CORS headers
package.json              odvisnosti: @upstash/redis, @vercel/blob, bcryptjs, jsonwebtoken
```

**Opomba o `api/auth.js`**: Vercel Hobby plan dovoli največ 12 serverless funkcij na deployment. Pet ločenih auth endpointov (login, change-password, add-user, me, set-name) je bilo združenih v eno datoteko z internim routingom po `?action=` query parametru. Projekt trenutno uporablja 11 od 12 dovoljenih funkcij — pri dodajanju novih endpointov v prihodnje razmisli o podobnem združevanju (npr. nove auth akcije gredo kot nov `case` v `auth.js`, ne kot nova datoteka).

## 🚀 Postavitev (deploy)

### 1. Pripravi repozitorij
```bash
git init
git add .
git commit -m "Sentria Events MVP"
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
- **Nalaganje slik** neposredno v admin panel (Vercel Blob, max 5MB, JPEG/PNG/WebP/GIF) — ni več odvisnosti od zunanjih hotlink servisov (Google Drive, Imgur), ki nezanesljivo blokirajo prikaz na tujih straneh
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
5. **Slike dogodkov**: trenutno samo URL vnos (ni file uploada). Za upload bi potrebovali Vercel Blob Storage — lahko dodamo v naslednji iteraciji.

## 🛠 Lokalni razvoj

```bash
npm install -g vercel
npm install
vercel dev
```
Vercel CLI bo povprašal za povezavo s KV bazo (lahko uporabiš isto produkcijsko ali ustvariš ločeno za dev).

## 📋 Naslednji koraki / ideje za V2

- Upload slik (Vercel Blob)
- Email potrditev (double opt-in) za GDPR skladnost
- Unsubscribe link v vsakem mailu
- Paginacija za catalog/series pri velikem številu eventov
- Audit log (kdo je kaj spremenil)
- Rate limiting na `/api/subscribe` proti spamu
