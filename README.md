# Aetheria

A 2D online action-RPG with AI companion agents. PC + mobile web. v1: in-game currency. v2: crypto tokens + P2P marketplace.

## Stack

- **Client**: Vite + React + TypeScript + Phaser 3 + Zustand + Tailwind
- **Server**: Node.js + Express + Socket.IO + SQLite (better-sqlite3) + JWT
- **Shared**: TypeScript types

## Run it

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Features (v1)

- Register / login (bcrypt + JWT)
- 5 classes: Warrior, Archer, Mage, Healer, Thief — each with distinct stats and starter skills
- Click/tap to move on a 2D world
- Real-time multiplayer (see other players move and fight)
- Combat with monsters → XP, gold, loot
- Level-up + stat growth
- Inventory + equipment
- NPC shop (potions, mana, gear)
- AI Companion agent with two skill modules:
  - **Hermes** — auto-suggests trades and fast-travel paths
  - **Obsidian Memory** — remembers what you do and adapts hints
- Personal house room (decorating + farming planned)

## v2 (planned)

- Forging/crafting
- Player marketplace
- Aether Token (game currency → on-chain)
- Pet/mount system
- Dungeon instancing

## Project layout

```
aetheria/
├── client/           # Vite + React + Phaser
├── server/           # Express + Socket.IO + SQLite
├── shared/           # Shared TypeScript types
└── data/             # SQLite database (gitignored)
```
