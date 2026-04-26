import Phaser from "phaser";
import {
  CLASSES,
  MONSTERS,
  ZONES,
  type ClassId,
  type MonsterState,
  type PlayerState,
  type ZoneId,
} from "@aetheria/shared";
import { useGameStore } from "../../store";
import { emitAttack, emitMove } from "../../socket";

interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  emoji: Phaser.GameObjects.Text;
  nameTag: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  targetPos: { x: number; y: number };
  state: PlayerState;
}

interface MonsterSprite {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  emoji: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  selectionRing: Phaser.GameObjects.Arc | null;
  state: MonsterState;
  targetPos: { x: number; y: number };
}

const FOLLOW_LERP = 0.15;
const NETWORK_LERP = 0.25;
const MOVE_SEND_INTERVAL = 80;

export class WorldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  private deco!: Phaser.GameObjects.Container;
  private targetIndicator!: Phaser.GameObjects.Arc;
  private players: Map<string, PlayerSprite> = new Map();
  private monsters: Map<string, MonsterSprite> = new Map();
  private floatings!: Phaser.GameObjects.Container;
  private floatingsById: Map<number, Phaser.GameObjects.Text> = new Map();
  private moveTarget: { x: number; y: number } | null = null;
  private lastSentMove = 0;
  private currentZoneId: ZoneId | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super("WorldScene");
  }

  create() {
    this.bg = this.add.rectangle(0, 0, 4000, 3000, 0x4a6741).setOrigin(0, 0).setDepth(0);
    this.grid = this.add.graphics().setDepth(1);
    this.deco = this.add.container().setDepth(2);
    this.floatings = this.add.container().setDepth(20);

    this.targetIndicator = this.add.circle(0, 0, 8, 0xffffff, 0.4).setDepth(3);
    this.targetIndicator.setVisible(false);

    this.cameras.main.setBackgroundColor("#0a0a0f");

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.handlePointer(p));

    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
    });

    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      this.syncFromStore(state, prev);
    });

    const initial = useGameStore.getState();
    this.syncFromStore(initial, initial);
  }

  private syncFromStore(state: ReturnType<typeof useGameStore.getState>, _prev: ReturnType<typeof useGameStore.getState>) {
    if (!state.zone) return;

    if (this.currentZoneId !== state.zone) {
      this.changeZone(state.zone);
    }

    for (const [id, sprite] of this.players) {
      if (!state.players.has(id)) {
        sprite.container.destroy();
        this.players.delete(id);
      }
    }
    for (const [id, p] of state.players) {
      const existing = this.players.get(id);
      if (existing) {
        existing.state = p;
        existing.targetPos = { x: p.pos.x, y: p.pos.y };
        const hpRatio = p.maxHp > 0 ? p.hp / p.maxHp : 0;
        existing.hpBarFill.width = Math.max(0, hpRatio * 36);
        existing.hpBarFill.fillColor = hpRatio > 0.5 ? 0x5dc88a : hpRatio > 0.25 ? 0xffd54f : 0xe05d5d;
        existing.nameTag.setText(`${p.name} · L${p.level}`);
      } else {
        this.spawnPlayerSprite(p, p.id === state.me?.id);
      }
    }

    for (const [id, sprite] of this.monsters) {
      if (!state.monsters.has(id)) {
        sprite.container.destroy();
        this.monsters.delete(id);
      }
    }
    for (const [id, m] of state.monsters) {
      const existing = this.monsters.get(id);
      if (existing) {
        existing.state = m;
        existing.targetPos = { x: m.pos.x, y: m.pos.y };
        const hpRatio = m.maxHp > 0 ? m.hp / m.maxHp : 0;
        existing.hpBarFill.width = Math.max(0, hpRatio * 36);
      } else {
        this.spawnMonsterSprite(m);
      }
      const sprite = this.monsters.get(id)!;
      const isSelected = state.selectedTargetId === id;
      if (isSelected && !sprite.selectionRing) {
        sprite.selectionRing = this.add.circle(0, 0, 26, 0xffd54f, 0).setStrokeStyle(2, 0xffd54f, 0.9);
        sprite.container.add(sprite.selectionRing);
      } else if (!isSelected && sprite.selectionRing) {
        sprite.selectionRing.destroy();
        sprite.selectionRing = null;
      }
    }

    const newFloatings = state.floatings;
    for (const f of newFloatings) {
      if (!this.floatingsById.has(f.id)) {
        const txt = this.add
          .text(f.x, f.y, f.text, {
            fontFamily: "Cinzel, Georgia, serif",
            fontSize: "20px",
            color: f.color,
            stroke: "#000",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(25);
        this.floatings.add(txt);
        this.floatingsById.set(f.id, txt);
        this.tweens.add({
          targets: txt,
          y: f.y - 60,
          alpha: 0,
          duration: 1100,
          ease: "Quad.easeOut",
          onComplete: () => {
            txt.destroy();
            this.floatingsById.delete(f.id);
          },
        });
      }
    }
  }

  private changeZone(zoneId: ZoneId) {
    this.currentZoneId = zoneId;
    const zone = ZONES[zoneId];
    this.bg.setSize(zone.width, zone.height);
    this.bg.fillColor = zone.bg;
    this.cameras.main.setBounds(0, 0, zone.width, zone.height);
    this.drawGrid(zone.width, zone.height);
    this.drawDeco(zoneId);
  }

  private drawGrid(w: number, h: number) {
    this.grid.clear();
    this.grid.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= w; x += 64) {
      this.grid.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += 64) {
      this.grid.lineBetween(0, y, w, y);
    }
  }

  private drawDeco(zoneId: ZoneId) {
    this.deco.removeAll(true);
    const z = ZONES[zoneId];
    if (zoneId === "town") {
      this.addBuilding(560, 380, "🏠 House", 0x6e4a2b);
      this.addBuilding(960, 380, "🛒 Shop", 0xc9a14b);
      this.addBuilding(1160, 720, "🏛 Bank", 0x7d5cff);
      this.addPortal(360, 700, "→ Meadow", "meadow");
      this.addPortal(1280, 380, "→ Forest", "forest");
      this.addPortal(800, 1000, "→ Crypt", "crypt");
    } else if (zoneId === "house") {
      this.addBuilding(200, 200, "🛏 Bed", 0xb88862);
      this.addBuilding(560, 200, "🍳 Kitchen", 0xc9a14b);
      this.addBuilding(380, 440, "🌱 Garden", 0x6b8e23);
    } else {
      this.addPortal(80, z.height / 2, "← Town", "town");
    }
  }

  private addBuilding(x: number, y: number, label: string, color: number) {
    const rect = this.add.rectangle(x, y, 100, 100, color, 0.85).setStrokeStyle(2, 0x000, 0.5);
    const txt = this.add
      .text(x, y - 70, label, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.deco.add([rect, txt]);
  }

  private addPortal(x: number, y: number, label: string, _zone: ZoneId) {
    const ring = this.add.circle(x, y, 40, 0x7d5cff, 0.4).setStrokeStyle(3, 0x7d5cff);
    const txt = this.add
      .text(x, y + 60, label, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "14px",
        color: "#bda8ff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.deco.add([ring, txt]);
  }

  private spawnPlayerSprite(p: PlayerState, isMe: boolean) {
    const def = CLASSES[p.classId as ClassId];
    const body = this.add.circle(0, 0, 16, def.color, 0.9).setStrokeStyle(2, isMe ? 0xffd54f : 0x000, 0.8);
    const emoji = this.add.text(0, 0, def.emoji, { fontSize: "20px" }).setOrigin(0.5);
    const nameTag = this.add
      .text(0, -34, `${p.name} · L${p.level}`, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "12px",
        color: isMe ? "#ffd54f" : "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const hpBarBg = this.add.rectangle(0, -22, 36, 5, 0x000, 0.7).setStrokeStyle(1, 0x2a2a3a);
    const hpBarFill = this.add.rectangle(-18, -22, 36, 4, 0x5dc88a).setOrigin(0, 0.5);

    const container = this.add.container(p.pos.x, p.pos.y, [body, emoji, nameTag, hpBarBg, hpBarFill]);
    container.setDepth(10);

    if (isMe) {
      this.cameras.main.startFollow(container, false, FOLLOW_LERP, FOLLOW_LERP);
    }

    this.players.set(p.id, {
      container,
      body,
      emoji,
      nameTag,
      hpBarBg,
      hpBarFill,
      targetPos: { x: p.pos.x, y: p.pos.y },
      state: p,
    });
  }

  private spawnMonsterSprite(m: MonsterState) {
    const def = MONSTERS[m.type];
    const body = this.add.circle(0, 0, 18, 0x222, 0.5).setStrokeStyle(2, 0xe05d5d);
    const emoji = this.add.text(0, 0, def.emoji, { fontSize: "26px" }).setOrigin(0.5);
    const hpBarBg = this.add.rectangle(0, -28, 36, 5, 0x000, 0.7).setStrokeStyle(1, 0x2a2a3a);
    const hpBarFill = this.add.rectangle(-18, -28, 36, 4, 0xe05d5d).setOrigin(0, 0.5);
    const lvTag = this.add
      .text(0, -42, `Lv ${m.level} ${def.name}`, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "11px",
        color: "#ffd1d1",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const container = this.add.container(m.pos.x, m.pos.y, [body, emoji, hpBarBg, hpBarFill, lvTag]);
    container.setDepth(9);
    container.setSize(48, 48);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      useGameStore.getState().selectTarget(m.id);
      emitAttack(m.id);
    });

    this.monsters.set(m.id, {
      container,
      body,
      emoji,
      hpBarBg,
      hpBarFill,
      selectionRing: null,
      state: m,
      targetPos: { x: m.pos.x, y: m.pos.y },
    });
  }

  private handlePointer(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const me = useGameStore.getState().me;
    if (!me) return;

    let nearestMonster: MonsterSprite | null = null;
    let bestDist = 32;
    for (const sprite of this.monsters.values()) {
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, sprite.container.x, sprite.container.y);
      if (d < bestDist) {
        bestDist = d;
        nearestMonster = sprite;
      }
    }
    if (nearestMonster) {
      useGameStore.getState().selectTarget(nearestMonster.state.id);
      emitAttack(nearestMonster.state.id);
      return;
    }

    this.moveTarget = { x: wp.x, y: wp.y };
    this.targetIndicator.setPosition(wp.x, wp.y).setVisible(true);
    this.tweens.add({
      targets: this.targetIndicator,
      alpha: { from: 0.8, to: 0.0 },
      duration: 600,
      onComplete: () => this.targetIndicator.setVisible(false).setAlpha(0.4),
    });
  }

  update(_time: number, delta: number) {
    const me = useGameStore.getState().me;
    if (!me) return;
    const mySprite = this.players.get(me.id);
    if (!mySprite) return;

    if (this.moveTarget) {
      const dx = this.moveTarget.x - mySprite.container.x;
      const dy = this.moveTarget.y - mySprite.container.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        const speed = me.stats.speed;
        const step = Math.min(dist, (speed * delta) / 1000);
        const nx = mySprite.container.x + (dx / dist) * step;
        const ny = mySprite.container.y + (dy / dist) * step;
        mySprite.container.setPosition(nx, ny);
        const facing = Math.atan2(dy, dx);

        const now = performance.now();
        if (now - this.lastSentMove > MOVE_SEND_INTERVAL) {
          this.lastSentMove = now;
          emitMove({ x: nx, y: ny }, facing);
        }
      } else {
        emitMove({ x: this.moveTarget.x, y: this.moveTarget.y }, 0);
        this.moveTarget = null;
      }
    }

    for (const [id, sprite] of this.players) {
      if (id === me.id) continue;
      const dx = sprite.targetPos.x - sprite.container.x;
      const dy = sprite.targetPos.y - sprite.container.y;
      sprite.container.x += dx * NETWORK_LERP;
      sprite.container.y += dy * NETWORK_LERP;
    }
    for (const sprite of this.monsters.values()) {
      const dx = sprite.targetPos.x - sprite.container.x;
      const dy = sprite.targetPos.y - sprite.container.y;
      sprite.container.x += dx * NETWORK_LERP;
      sprite.container.y += dy * NETWORK_LERP;
    }

    useGameStore.getState().clearOldFloatings();
  }

  shutdown() {
    this.unsubscribe?.();
  }
}
