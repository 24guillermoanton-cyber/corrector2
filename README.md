# ⚽ Penalti Stars

Juego web de fútbol: colecciona cartas de futbolistas y porteros, abre sobres con monedas y reta a tus amigos a **tandas de penaltis online en tiempo real**, cada uno desde su dispositivo.

- Cuentas con usuario y contraseña (hash **scrypt**), escudo de equipo, monedas, colección, alineación, victorias, derrotas y racha.
- Salas privadas con código o enlace, partido sincronizado por **Socket.IO** y resultado controlado por el servidor.
- Tanda reglamentaria: 5 penaltis por equipo alternando, final anticipado y **muerte súbita**.
- Portería con 6 zonas, decisiones ocultas, estadísticas de lanzador y portero y **segunda estirada** del portero.
- Tienda de sobres con probabilidades visibles y animación de apertura (túnel, luces, pistas, revelación, sonido, opción de saltar).
- Cartas normales (Bronce, Plata, Oro, Élite) y especiales **TOTY** (azul) y **FUTTIES** (rosa).
- **Player picks** cada 3 victorias seguidas, clasificaciones públicas y **panel de administración**.
- Interfaz en español, adaptada a móvil y ordenador.

---

## 1. Requisitos

- **Node.js 20 o superior** (probado con Node 24).
- Opcional: **PostgreSQL 13+**. Si no se configura, el juego usa **PGlite** (PostgreSQL embebido) y guarda los datos en disco en `./data/pglite`, así que funciona sin instalar nada más.

## 2. Instalación y ejecución local

```bash
git clone https://github.com/<tu-usuario>/penalti-stars.git
cd penalti-stars
npm install
cp .env.example .env      # edita los valores (ver abajo)
npm start
```

Abre <http://localhost:3000>. Para probar una partida en un solo ordenador, abre una segunda ventana en modo incógnito (o usa `http://127.0.0.1:3000`, que tiene cookies separadas) y crea otra cuenta.

> `npm start` no lee `.env` automáticamente. Puedes exportar las variables en tu terminal o usar `node --env-file=.env server/index.js`.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No | Puerto HTTP (por defecto 3000; Render lo asigna solo). |
| `DATABASE_URL` | Recomendado en producción | Cadena de conexión PostgreSQL. Si está vacía se usa PGlite en `DATA_DIR`. |
| `DATA_DIR` | No | Carpeta de datos de PGlite (por defecto `./data/pglite`). |
| `ADMIN_INVITE_CODE` | Para tener administradores | Código secreto que convierte una cuenta en administradora. **Solo existe en el servidor.** |
| `MATCH_CHOOSE_MS` | No | Milisegundos para elegir en cada lanzamiento (por defecto 15000). |
| `NODE_ENV` | No | En `production` la cookie de sesión se marca como `Secure`. |

El archivo `.env.example` contiene solo marcadores de posición. **Nunca subas `.env`** (ya está en `.gitignore`).

### Pruebas automáticas

```bash
npm test
```

Arrancan el servidor real con una base de datos PGlite en memoria y clientes Socket.IO. Cubren, entre otras cosas:

- Tanda completa 5-4 entre dos usuarios, final anticipado 3-0 y empate 5-5 con muerte súbita.
- Segunda estirada (aparece, oculta la zona del disparo, solo el portero puede actuar, parada y caducidad de la ventana) y la probabilidad de doble parada.
- Decisiones ocultas del rival, desconexión con pausa/reconexión y derrota por abandono.
- Recompensas entregadas una sola vez.
- Compra y apertura de sobres, compras simultáneas sin saldo negativo, probabilidades.
- Player pick a las 3 victorias, opciones fijas tras recargar, reclamar una sola vez, la derrota rompe la racha.
- Conservación de datos tras cerrar sesión y tras reiniciar el servidor.
- Permisos de administrador, límite de intentos del código y que el código no aparece en ningún archivo del repositorio.

## 3. Base de datos

- **Local**: sin `DATABASE_URL` se usa PGlite (PostgreSQL compilado a WebAssembly) en `DATA_DIR`. Los datos persisten entre reinicios.
- **Producción**: define `DATABASE_URL` con un PostgreSQL real (Render, Neon, Supabase, Railway…). Las tablas se crean solas al arrancar (`server/db.js`); no hay que ejecutar migraciones a mano.
- SSL: se activa automáticamente para hosts remotos. Usa `PGSSL=disable` si tu servidor no admite SSL.

Tablas principales: `users`, `sessions`, `user_cards`, `pack_openings`, `player_picks`, `matches`, `admin_logs`, `auth_attempts`.

## 4. Publicar en Render (compatible con WebSockets)

El repositorio incluye `render.yaml` (Blueprint) que crea el servicio web y una base de datos PostgreSQL.

1. Entra en <https://dashboard.render.com> con tu cuenta vinculada a GitHub.
2. **New → Blueprint** y elige este repositorio.
3. Render detecta `render.yaml`. Te pedirá el valor de **`ADMIN_INVITE_CODE`**: escribe ahí tu código secreto de administrador (no lo pongas en ningún archivo).
4. Pulsa **Apply**. Render instalará dependencias (`npm ci --omit=dev`), creará la base de datos, enlazará `DATABASE_URL` y arrancará con `npm start`.
5. Abre la URL `https://penalti-stars-xxxx.onrender.com` y crea tu cuenta. Para ser administrador, escribe el código en el campo *Código de administrador* al registrarte o al iniciar sesión.

Notas del plan gratuito de Render:
- El servicio web se “duerme” tras un rato sin visitas y tarda unos segundos en despertar. Las partidas en curso se pierden si el servidor se reinicia (se anulan sin premios).
- La base de datos PostgreSQL gratuita de Render **caduca a los 30 días**. Para conservar los datos a largo plazo, cambia a un plan de pago o usa un PostgreSQL gratuito externo (p. ej. Neon) y pon su URL en `DATABASE_URL`.

Otros alojamientos con soporte de WebSockets: Railway, Fly.io o cualquier VPS con Node (`npm ci && npm start` detrás de un proxy que permita `Upgrade: websocket`). El juego funciona con **una sola instancia** (el estado de las salas vive en memoria).

## 5. Cómo se juega y reglas de resolución

### Tanda
- Cinco penaltis por equipo, alternando (empieza quien creó la sala).
- Termina antes si un equipo ya no puede alcanzar al otro.
- Empate tras los cinco: **muerte súbita** por parejas de lanzamientos.
- 15 s para elegir. Si no eliges, se elige al azar; **3 tiempos agotados seguidos = derrota por inactividad**.
- Si un jugador se desconecta, la jugada se **pausa**; si no vuelve en **30 s**, pierde por abandono. El botón *Abandonar* también da la derrota inmediata.

### Lanzamiento
El lanzador elige una de 6 zonas (arriba/media/abajo × izquierda/derecha, vistas desde el punto de penalti) y el portero elige dónde tirarse. Nadie ve la elección del otro hasta que ambos confirman o se acaba el tiempo: el servidor no envía la zona del rival a ningún cliente antes de resolver.

Estadísticas (escala 1-99):
- **Lanzador**: precisión de penalti, potencia y calidad de lanzamiento. Media = 50 % precisión + 20 % potencia + 30 % calidad.
- **Portero**: reflejos, capacidad de parada y reincorporación. Media = 50 % parada + 30 % reflejos + 20 % reincorporación.

Resolución (valores en `server/config.js → SHOT`):
1. **Potencia del disparo** = potencia del lanzador + aleatorio entre −10 y +5.
2. **Fuera**: probabilidad = base por altura (arriba 12 %, media 5 %, abajo 6 %) × (110 − precisión) / 50.
3. **Si el portero adivina la zona**: parada = 70 % + 0,8 %·(parada−50) + 0,4 %·(reflejos−50) − 0,6 %·(potencia−50) − 0,4 %·(calidad−50) + ajuste de altura (escuadras −12 %, abajo +5 %), limitado entre 45 % y 95 %.
4. **Si se equivoca**: es gol, salvo que se active la segunda estirada.

### ⚡ ¡Doble parada!
Solo para porteros **de oro o superior** (bronce y plata no). Si el portero se tira al lado equivocado, hay un **40 %** de probabilidad de que aparezca **¡DOBLE PARADA!** (la zona del disparo sigue oculta):

- El portero tiene 3 segundos para tocar en orden 5 círculos numerados (minijuego tipo Pokémon GO).
- Si lo completa, tiene **1 segundo** para volver a tirarse a otra zona.
- Si acierta la zona, la probabilidad de parada es el 65 % de la normal.

El juego incluye un tutorial (se muestra la primera vez y está en *Cómo se juega*).

## 6. Economía (fácil de ajustar en `server/config.js`)

| Concepto | Valor |
|---|---|
| Monedas iniciales | 1000 |
| Victoria / derrota / abandono | +150 / +50 / 0 |
| Venta rápida de repetidas | Bronce 10 · Plata 25 · Oro 60 · Élite 120 · TOTY/FUTTIES 300 |

| Sobre | Precio | Bronce | Plata | Oro | Élite | TOTY | FUTTIES |
|---|---|---|---|---|---|---|---|
| Bronce | 500 | 70 % | 25 % | 5 % | – | – | – |
| Plata | 1500 | 25 % | 50 % | 22 % | 3 % | – | – |
| Oro | 4000 | – | 30 % | 55 % | 12 % | 1,5 % | 1,5 % |
| Élite | 10000 | – | – | 50 % | 38 % | 6 % | 6 % |

Los sobres son caros a propósito: hay que ganar muchas tandas para abrir los mejores. Cada sobre da **exactamente 1 lanzador y 1 portero**; la probabilidad se aplica a cada carta por separado. Las compras se descuentan de forma atómica en la base de datos.

**Player pick**: cada 3 victorias seguidas se generan y guardan 3 opciones (Oro 55 %, Élite 33 %, TOTY 6 %, FUTTIES 6 %). Las opciones no cambian al recargar, los picks pendientes no caducan y perder pone la racha a 0.

**Repetidas**: se pueden vender las copias sobrantes (siempre conservas una).

## 7. Cartas, fotos y datos

Los nombres son de futbolistas y porteros reales, pero **las valoraciones son orientativas de juego**, inventadas a partir de su fama como lanzadores o paradores de penaltis: **no son estadísticas verificadas ni oficiales**. Las cartas especiales tienen estadísticas mejoradas y efectos propios: **TOTY** (azul, borde dorado giratorio, aura, estrellas y brillo holográfico) y **FUTTIES** (rosa, corazones y destellos, aura y brillo holográfico); al salir en un sobre tienen un escenario especial con aurora, temblor, halo y lluvia de partículas.

**Fotos**: se usan fotos de **Wikimedia Commons** con licencia libre (Creative Commons o dominio público). Cada carta indica autor y licencia en su ficha, y hay una página *Créditos de fotos* en la colección. El listado está en `public/data/photos.json` y se regenera con `node scripts/fetch-photos.mjs`. Si un jugador no tiene foto libre, se muestra una ilustración SVG propia. No se usan fotos oficiales de clubes ni de videojuegos, ni logotipos. Proyecto sin afiliación con clubes, ligas, EA SPORTS ni FIFA.

## 8. Administración

- En las pantallas de registro e inicio de sesión hay un campo opcional **Código de administrador**.
- El código se compara **solo en el servidor** con la variable `ADMIN_INVITE_CODE` (comparación en tiempo constante). No aparece en el código del navegador ni en el repositorio.
- Máximo **5 intentos fallidos cada 30 minutos** por IP o usuario; después se bloquea temporalmente.
- El panel permite ver cuentas y quién está conectado, victorias/derrotas, **banear/desbanear** (cierra sus sesiones y le expulsa de la partida), **borrar cuentas** (hay que escribir el nombre exacto) y **ajustar las monedas de la propia cuenta**. Todas las acciones se comprueban en el servidor y quedan en el **registro de operaciones**.

## 9. Seguridad

- Contraseñas con `scrypt` y sal aleatoria; sesiones con token aleatorio guardado como hash, cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en producción).
- Límite de intentos de inicio de sesión y de creación de cuentas.
- Las peticiones que modifican datos deben ser JSON (protección CSRF) y hay cabeceras de seguridad (CSP, `X-Frame-Options`, etc.).
- El servidor decide resultados, monedas, aperturas y recompensas; el cliente solo envía elecciones (zona 0-5) que se validan. Las recompensas se registran con una transición única `playing → finished`, por lo que no pueden cobrarse dos veces.

## 10. Estructura

```
server/
  index.js    arranque
  app.js      API HTTP, sesiones, administración y eventos Socket.IO
  match.js    salas y motor de la tanda (autoridad del servidor)
  game.js     sobres, colección, recompensas, picks, clasificaciones
  cards.js    catálogo de cartas
  config.js   economía, probabilidades, tiempos y reglas
  auth.js     hash de contraseñas, sesiones y límites de intentos
  db.js       PostgreSQL / PGlite y esquema
public/       cliente (HTML, CSS y módulos JS sin dependencias)
test/         pruebas end-to-end (node:test)
render.yaml   despliegue en Render
```

## 11. Limitaciones conocidas / ideas

- Las salas viven en memoria: un reinicio del servidor anula las partidas en curso (sin premios) y no se puede escalar a varias instancias sin un adaptador compartido (p. ej. Redis).
- No hay recuperación de contraseña (no se piden correos).
- Dos cuentas de la misma persona podrían jugar entre sí para ganar monedas; si hiciera falta, se puede añadir un límite diario de recompensas en `finishMatch`.
- No hay revancha automática con el mismo rival (se crea otra sala).
