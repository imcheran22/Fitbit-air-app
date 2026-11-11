# Cómo obtener tu token de Zepp

El backend necesita autenticarse contra la nube de Zepp/Huami. Tienes dos
caminos; el del **token** es el recomendado (no toca el login con rate-limit).

---

## Opción A · Script de login (la más fácil — SIN proxy)  ⭐

No necesitas HTTP Toolkit ni teléfono conectado. Desde la raíz del repo:

```bash
python -m backend.get_token
# te pregunta email y contraseña de Zepp y te imprime:
#   ZEPP_APP_TOKEN=...
#   ZEPP_USER_ID=...
```

Pega esos dos valores en `backend/.env` (y luego en Vercel). Con el token ya no
necesitas la contraseña, y evitas el rate-limit del login.

> Si tu cuenta Zepp es por **Google/Apple** (login social) no hay contraseña
> directa → usa la Opción B (proxy).

Alternativa equivalente: poner `ZEPP_EMAIL` + `ZEPP_PASSWORD` directamente en
`backend/.env` y dejar que el backend haga el login en cada arranque (más simple
pero golpea el login con rate-limit si reinicias seguido).

---

## Opción B · Token pre-extraído (recomendado)

Capturas **una vez** el `apptoken`, `user_id` y el `host` regional desde la
app Zepp de tu teléfono, y los pones en `.env`:

```
ZEPP_APP_TOKEN=<apptoken capturado>
ZEPP_USER_ID=<tu user id>
```

### Cómo capturarlo (con HTTP Toolkit, gratis)

1. Instala [HTTP Toolkit](https://httptoolkit.com/) en tu PC.
2. "Intercept" → **Android device via ADB** (o el método para tu teléfono).
3. Abre la app **Zepp** y entra a tu panel de salud para que sincronice.
4. En HTTP Toolkit, filtra por `huami` o `zepp.com`. Busca una petición a
   `api-mifit-*.zepp.com` o `api-mifit.huami.com`.
5. En esa petición:
   - Cabecera **`apptoken`** → `ZEPP_APP_TOKEN`
   - El **`userId`** (en la query o el path `/users/<id>/...`) → `ZEPP_USER_ID`
   - El **host** (ej. `api-mifit-us3.zepp.com`) → cópialo si difiere del default.

### Alternativa: script huami-token

[`argrento/huami-token`](https://github.com/argrento/huami-token) hace el login
y te imprime el `app_token` y `user_id` directamente:

```bash
python huami_token.py --method amazfit --email TU_EMAIL --password TU_PASS --no_logout
```

---

## Nota sobre el host regional

Tu cuenta vive en una región (`us3`, `de2`, …). El cliente usa por defecto el
host que devuelve el login. Si capturaste el token a mano y las llamadas dan
404/401, ajusta el host en `zepp/client.py` (`Session.api_host`) al que viste
en HTTP Toolkit, p. ej. `api-mifit-us3.zepp.com`.

## Métricas propietarias (readiness, estrés, SpO₂, HRV, batería corporal)

Los endpoints y códigos ya están implementados (`zepp/client.py`). Lo único que
puede necesitar un ajuste fino es **de qué campo del evento sale el número**
(`zepp/normalize.py` → `event_value`): en cuanto tengas el token y veamos UNA
respuesta real, se confirma en un minuto. Mientras tanto, esas métricas caen a
valores derivados de pasos/sueño/HR (marcados como tales).
