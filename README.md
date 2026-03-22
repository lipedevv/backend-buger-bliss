# Backend Buger Bliss

API Node com:

- Express
- SQLite
- Baileys
- autenticacao por codigo
- dashboard admin
- pedidos
- entregadores
- rastreio

## Instalar

```bash
npm install
```

## Configurar

Crie `.env` com base em `.env.example`:

```bash
PORT=4010
LOG_LEVEL=info
BAILEYS_AUTH_DIR=./.baileys-auth
SQLITE_PATH=./data/catalog.sqlite
```

## Rodar

```bash
npm run dev
```

## Endpoints

- `GET /health`
- `GET /api/catalog/snapshot`
- `PUT /api/catalog/restaurant`
- `PUT /api/catalog/hours`
- `POST /api/catalog/categories`
- `POST /api/catalog/products`
- `POST /api/catalog/discounts`
- `POST /api/catalog/delivery-zones`
- `POST /api/auth/request-code`
- `POST /api/auth/verify-code`
- `GET /api/auth/me`
- `PATCH /api/profile`
- `POST /api/auth/logout`
- `GET /api/addresses`
- `POST /api/addresses`
- `DELETE /api/addresses/:id`
- `POST /api/addresses/:id/default`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/admin/dashboard`
- `POST /api/admin/bootstrap`
- `POST /api/driver/profile`
- `PATCH /api/driver/profile`
- `GET /api/driver/dashboard`
- `POST /api/driver/location`
- `GET /api/whatsapp/status`
- `POST /api/whatsapp/connect`
- `POST /api/whatsapp/disconnect`
- `POST /api/phone-verifications/request`
- `POST /api/phone-verifications/confirm`
