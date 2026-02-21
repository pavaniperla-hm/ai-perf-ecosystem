# E-Commerce Microservices — Performance Testing Scaffold

A three-service e-commerce backend built for load and performance testing.
Each service is independently deployable, backed by its own PostgreSQL database,
and fronted by an Nginx API gateway.

---

## Architecture

```
                        ┌─────────────────────────────────┐
  HTTP :80              │         Nginx API Gateway        │
  ──────────────────►   │  /api/users     → :8001          │
                        │  /api/products  → :8002          │
                        │  /api/orders    → :8003          │
                        └────────┬──────────┬──────────────┘
                                 │          │          │
               ┌─────────────────┘  ┌───────┘  ┌──────┘
               ▼                    ▼           ▼
     ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
     │   User Service   │  │   Product    │  │   Order Service  │
     │  Python FastAPI  │  │   Service    │  │  Python FastAPI  │
     │     :8001        │  │  Node/Express│  │     :8003        │
     └────────┬─────────┘  │    :8002     │  └────────┬─────────┘
              │             └──────┬───────┘           │
              ▼                    ▼                    ▼
     ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
     │   user-db    │    │  product-db  │    │    order-db      │
     │ PostgreSQL   │    │  PostgreSQL  │    │   PostgreSQL     │
     │  10 K rows   │    │   5 K rows   │    │   50 K rows      │
     └──────────────┘    └──────────────┘    └──────────────────┘
```

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Docker Desktop | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | v2 (bundled) | included with Docker Desktop |
| Git | 2.x | https://git-scm.com/ |
| Python *(optional, local dev)* | 3.11+ | https://python.org |
| Node.js *(optional, local dev)* | 20 LTS | https://nodejs.org |
| VS Code *(optional)* | latest | https://code.visualstudio.com/ |

> The only hard requirement to **run** the stack is **Docker Desktop**.
> Python and Node.js are only needed if you want to run services outside Docker.

---

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url>
cd Demo

# 2. Build images and start all services (first run seeds the databases)
docker compose up --build

# 3. Verify everything is healthy
curl http://localhost/health          # gateway
curl http://localhost/api/users       # user service
curl http://localhost/api/products    # product service
curl http://localhost/api/orders      # order service
```

> **First-run seed times** (approximate):
> - User Service  → ~30–60 s (10,000 records)
> - Product Service → ~15–30 s (5,000 records)
> - Order Service → ~60–120 s (50,000 records)
>
> Services report healthy only after seeding completes.

To stop and remove containers (data volumes are preserved):

```bash
docker compose down
```

To also wipe all seed data (full reset):

```bash
docker compose down -v
```

---

## Services

### 1. User Service — `user-service/` (Python · FastAPI)

| | |
|---|---|
| Runtime | Python 3.11 |
| Framework | FastAPI 0.111 + Uvicorn |
| ORM | SQLAlchemy 2.0 |
| Database | PostgreSQL 15 (`userdb`) |
| Seed | 10,000 customers via Faker |
| Port | `8001` (direct) / `/api/users` (gateway) |

**Endpoints**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/users?skip=0&limit=20` | List users (max 100) |
| `GET` | `/users/{id}` | Get user by ID |
| `POST` | `/users` | Create user |
| `PUT` | `/users/{id}` | Update user |
| `DELETE` | `/users/{id}` | Delete user |

**User payload**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "555-0100",
  "address": "123 Main St",
  "city": "Springfield",
  "country": "US"
}
```

---

### 2. Product Service — `product-service/` (Node.js · Express)

| | |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express 4.x |
| Database driver | `pg` (node-postgres) |
| Database | PostgreSQL 15 (`productdb`) |
| Seed | 5,000 products via @faker-js/faker |
| Port | `8002` (direct) / `/api/products` (gateway) |

**Endpoints**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/products?skip=0&limit=20` | List products (max 100) |
| `GET` | `/products/{id}` | Get product by ID |
| `POST` | `/products` | Create product |
| `PUT` | `/products/{id}` | Update product |
| `DELETE` | `/products/{id}` | Delete product |

**Product payload**

```json
{
  "name": "Wireless Headphones",
  "description": "Over-ear noise-cancelling headphones",
  "price": 79.99,
  "category": "Electronics",
  "stock": 250
}
```

---

### 3. Order Service — `order-service/` (Python · FastAPI)

| | |
|---|---|
| Runtime | Python 3.11 |
| Framework | FastAPI 0.111 + Uvicorn |
| ORM | SQLAlchemy 2.0 (Core bulk insert for seeding) |
| Database | PostgreSQL 15 (`orderdb`) |
| Seed | 50,000 orders via random data |
| Port | `8003` (direct) / `/api/orders` (gateway) |

**Endpoints**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/orders?skip=0&limit=20` | List orders (max 100) |
| `GET` | `/orders/{id}` | Get order by ID |
| `POST` | `/orders` | Create order |
| `PUT` | `/orders/{id}` | Update order |
| `DELETE` | `/orders/{id}` | Delete order |

**Order payload**

```json
{
  "user_id": 42,
  "product_id": 7,
  "quantity": 2,
  "unit_price": 79.99,
  "total_price": 159.98,
  "status": "pending"
}
```

Valid statuses: `pending` · `processing` · `shipped` · `delivered` · `cancelled`

---

## Docker

### File overview

```
docker-compose.yml          # Orchestrates all 6 containers
user-service/Dockerfile     # python:3.11-slim → uvicorn
product-service/Dockerfile  # node:20-alpine → node index.js
order-service/Dockerfile    # python:3.11-slim → uvicorn
nginx/nginx.conf            # Reverse proxy + path rewriting
```

### Useful Docker commands

```bash
# Rebuild a single service after code changes
docker compose up --build user-service

# Follow logs for all services
docker compose logs -f

# Follow logs for one service
docker compose logs -f order-service

# Open a shell inside a running container
docker compose exec user-service bash

# Check container health statuses
docker compose ps

# Remove containers but keep database volumes
docker compose down

# Full reset (removes volumes — triggers re-seed on next up)
docker compose down -v
```

### Port map

| Container | Host port | Purpose |
|---|---|---|
| `nginx` | `80` | API gateway (primary entry point) |
| `user-service` | `8001` | Direct access (bypass gateway) |
| `product-service` | `8002` | Direct access (bypass gateway) |
| `order-service` | `8003` | Direct access (bypass gateway) |

---

## Local Development (without Docker)

### Python services

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies (from inside user-service/ or order-service/)
pip install -r requirements.txt

# Set the database URL to a local PostgreSQL instance
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/userdb

# Seed the database
python seed.py

# Start the service
uvicorn main:app --reload --port 8001
```

### Node.js service

```bash
# Inside product-service/
npm install

# Set the database URL
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productdb

# Seed then start (seeding is built into startup)
node index.js

# Or seed separately
node seed.js
```

---

## VS Code Setup

### Recommended extensions

Install via the Extensions panel (`Ctrl+Shift+X`) or the CLI:

```bash
# Python development
code --install-extension ms-python.python
code --install-extension ms-python.pylance
code --install-extension ms-python.black-formatter

# Node.js / JavaScript
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode

# Docker
code --install-extension ms-azuretools.vscode-docker

# REST client (test endpoints without leaving VS Code)
code --install-extension humao.rest-client

# Database explorer
code --install-extension cweijan.vscode-postgresql-client2

# Git
code --install-extension eamodio.gitlens
```

### Workspace settings

Create `.vscode/settings.json` in the project root:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "editor.rulers": [88],
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "docker.host": "unix:///var/run/docker.sock",
  "files.exclude": {
    "**/__pycache__": true,
    "**/*.pyc": true,
    "**/node_modules": true
  }
}
```

### Debugging a Python service locally

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "User Service",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload", "--port", "8001"],
      "cwd": "${workspaceFolder}/user-service",
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/userdb"
      }
    },
    {
      "name": "Order Service",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload", "--port", "8003"],
      "cwd": "${workspaceFolder}/order-service",
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/orderdb"
      }
    }
  ]
}
```

### Debugging the Node.js service locally

Add this configuration to `.vscode/launch.json`:

```json
{
  "name": "Product Service",
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/product-service/index.js",
  "cwd": "${workspaceFolder}/product-service",
  "env": {
    "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/productdb",
    "SERVICE_PORT": "8002"
  }
}
```

---

## Project Structure

```
Demo/
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── user-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── start.sh
│   ├── database.py
│   ├── models.py
│   ├── seed.py
│   └── main.py
├── product-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── db.js
│   ├── seed.js
│   └── index.js
└── order-service/
    ├── Dockerfile
    ├── requirements.txt
    ├── start.sh
    ├── database.py
    ├── models.py
    ├── seed.py
    └── main.py
```

---

## Performance Testing Tips

- Hit the gateway (`localhost:80`) to test the full stack including Nginx routing overhead.
- Hit services directly (`localhost:8001–8003`) to isolate service-level performance.
- Use `?skip=` and `?limit=` to test pagination under load.
- The order-service database has indexes on `user_id`, `product_id`, and `status` — test filtered queries for realistic workloads.
- Run `docker compose down -v && docker compose up --build` for a clean re-seed between test runs.
