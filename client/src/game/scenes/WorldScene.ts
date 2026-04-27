import Phaser from "phaser";
import {
  CLASSES,
  ITEMS,
  MONSTERS,
  ZONES,
  type ClassId,
  type FloorItem,
  type MonsterState,
  type PlayerState,
  type ZoneId,
} from "@aetheria/shared";
import { useGameStore, type PanelId } from "../../store";
import { emitAttack, emitMove, emitTravel } from "../../socket";

interface PlayerSprite {
  container: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Arc;
  torso: Phaser.GameObjects.Rectangle;
  leg1: Phaser.GameObjects.Rectangle;
  leg2: Phaser.GameObjects.Rectangle;
  arm1: Phaser.GameObjects.Rectangle;
  arm2: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Text;
  nameTag: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  selfRing: Phaser.GameObjects.Ellipse | null;
  targetPos: { x: number; y: number };
  state: PlayerState;
  walkPhase: number;
  lastFacing: number;
}

interface MonsterSprite {
  container: Phaser.GameObjects.Container;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  selectionRing: Phaser.GameObjects.Arc | null;
  state: MonsterState;
  targetPos: { x: number; y: number };
}

type EnterableTarget = { kind: "zone"; zone: ZoneId } | { kind: "panel"; panel: PanelId };

interface Enterable {
  x: number;
  y: number;
  radius: number;
  target: EnterableTarget;
  label: string;
}

const FOLLOW_LERP = 0.15;
const NETWORK_LERP = 0.25;
const MOVE_SEND_INTERVAL = 80;
const WALK_BOB_HZ = 6;

export class WorldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Rectangle;
  private grid!: Phaser.GameObjects.Graphics;
  private deco!: Phaser.GameObjects.Container;
  private targetIndicator!: Phaser.GameObjects.Arc;
  private enterPrompt!: Phaser.GameObjects.Text;
  private players: Map<string, PlayerSprite> = new Map();
  private monsters: Map<string, MonsterSprite> = new Map();
  private floorSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private floatings!: Phaser.GameObjects.Container;
  private floatingsById: Map<number, Phaser.GameObjects.Text> = new Map();
  private moveTarget: { x: number; y: number } | null = null;
  private autoAttackTargetId: string | null = null;
  private lastSentMove = 0;
  private lastSentAttack = 0;
  private currentZoneId: ZoneId | null = null;
  private enterables: Enterable[] = [];
  private armedForEnter = true;
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

    this.enterPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "13px",
        color: "#ffd54f",
        backgroundColor: "rgba(0,0,0,0.65)",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(22)
      .setVisible(false);

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

  private syncFromStore(
    state: ReturnType<typeof useGameStore.getState>,
    _prev: ReturnType<typeof useGameStore.getState>,
  ) {
    if (!state.zone) return;

    const zoneChanged = this.currentZoneId !== state.zone;
    if (zoneChanged) {
      this.changeZone(state.zone);
      this.moveTarget = null;
      this.autoAttackTargetId = null;
      // Disarm enter triggers so we don't bounce back through the door
      // we just used. Re-arms when player walks out of all enterables.
      this.armedForEnter = false;
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
        // On zone change, the existing local sprite for me must teleport to
        // the server-authoritative entry point — otherwise it stays where
        // I last walked in the old zone.
        if (zoneChanged) {
          existing.container.setPosition(p.pos.x, p.pos.y);
        }
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
        if (this.autoAttackTargetId === id) this.autoAttackTargetId = null;
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
        sprite.selectionRing = this.add
          .circle(0, 0, 26, 0xffd54f, 0)
          .setStrokeStyle(2, 0xffd54f, 0.9);
        sprite.container.add(sprite.selectionRing);
      } else if (!isSelected && sprite.selectionRing) {
        sprite.selectionRing.destroy();
        sprite.selectionRing = null;
      }
    }

    // Floor item sync
    for (const [uid, sprite] of this.floorSprites) {
      if (!state.floorItems.has(uid)) {
        sprite.destroy();
        this.floorSprites.delete(uid);
      }
    }
    for (const [uid, item] of state.floorItems) {
      if (this.floorSprites.has(uid)) continue;
      this.floorSprites.set(uid, this.spawnFloorItem(item));
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
    for (let x = 0; x <= w; x += 64) this.grid.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += 64) this.grid.lineBetween(0, y, w, y);
  }

  private drawDeco(zoneId: ZoneId) {
    this.deco.removeAll(true);
    this.enterables = [];
    const z = ZONES[zoneId];

    if (zoneId === "town") {
      // Stone walking paths (drawn first so buildings sit on them).
      // Main horizontal road at y=600, vertical road at x=800, plus branches.
      this.addPath(800, 600, 1300, 56);            // east-west road
      this.addPath(800, 600, 56, 900);             // north-south road
      this.addPath(560, 480, 56, 240);             // path to your house
      this.addPath(960, 480, 56, 240);             // path to shop
      this.addPath(1080, 720, 200, 56);            // path to bank (horizontal stub)
      this.addPath(1160, 760, 56, 120);            // path to bank (vertical stub)
      this.addPath(360, 700, 56, 200);             // path to meadow portal
      this.addPath(1280, 380, 56, 220);            // path to forest portal (above road)
      this.addPath(1280, 490, 200, 56);            // path connecting forest to main road
      this.addPath(800, 1000, 56, 200);            // path to crypt portal
      // Plaza at center
      const plaza = this.add
        .circle(800, 600, 70, 0xb8a878, 0.45)
        .setStrokeStyle(2, 0x6e5a3a, 0.4);
      this.deco.add(plaza);

      // House (player home) — south-facing door, zone transition.
      this.addHouse(560, 380, "Your House", { wall: 0xd6b48a, roof: 0x8a3a3a, door: 0x4a2a14 });
      this.enterables.push({
        x: 560,
        y: 460,
        radius: 50,
        target: { kind: "zone", zone: "house" },
        label: "Enter House",
      });

      // Shop — opens shop panel.
      this.addHouse(960, 380, "🛒 General Shop", { wall: 0xe6cfa3, roof: 0xb8862c, door: 0x4a2a14, sign: "🛒" });
      this.enterables.push({
        x: 960,
        y: 460,
        radius: 50,
        target: { kind: "panel", panel: "shop" },
        label: "Enter Shop",
      });

      // Bank — bag ↔ vault transfers.
      this.addHouse(1160, 720, "🏛 Bank", { wall: 0xc9d4e2, roof: 0x4a4f8a, door: 0x2a2440, sign: "🏛" });
      this.enterables.push({
        x: 1160,
        y: 800,
        radius: 50,
        target: { kind: "panel", panel: "bank" },
        label: "Open Vault",
      });

      this.addPortal(360, 700, "→ Meadow");
      this.addPortal(1280, 380, "→ Forest");
      this.addPortal(800, 1000, "→ Crypt");
      this.enterables.push(
        { x: 360, y: 700, radius: 55, target: { kind: "zone", zone: "meadow" }, label: "To Meadow" },
        { x: 1280, y: 380, radius: 55, target: { kind: "zone", zone: "forest" }, label: "To Forest" },
        { x: 800, y: 1000, radius: 55, target: { kind: "zone", zone: "crypt" }, label: "To Crypt" },
      );
    } else if (zoneId === "house") {
      // Inside the house — furniture as decorative buildings, exit door on the west.
      this.addFurniture(200, 200, "🛏 Bed", 0xb88862);
      this.addFurniture(560, 200, "🍳 Kitchen", 0xc9a14b);
      this.addFurniture(380, 440, "🌱 Garden", 0x6b8e23);
      this.addExitDoor(120, 500, "← Town");
      this.enterables.push({
        x: 120,
        y: 500,
        radius: 55,
        target: { kind: "zone", zone: "town" },
        label: "Back to Town",
      });
    } else {
      // Outdoor zones — single road eastward from town portal.
      const portalY = z.height / 2;
      this.addPath(z.width / 2, portalY, z.width - 200, 50);
      this.addPortal(80, portalY, "← Town");
      this.enterables.push({
        x: 80,
        y: portalY,
        radius: 55,
        target: { kind: "zone", zone: "town" },
        label: "Back to Town",
      });
    }
  }

  private addHouse(
    x: number,
    y: number,
    label: string,
    palette: { wall: number; roof: number; door: number; sign?: string },
  ) {
    // All shapes drawn via Graphics with absolute world coordinates so the
    // roof actually meets the wall — no Phaser shape-origin guesswork.
    const g = this.add.graphics();

    // Local geometry (centered around (x, y), wall-top is y_wallTop).
    const wallW = 110;
    const wallH = 60;
    const wallTop = y - 5;
    const wallBottom = wallTop + wallH;
    const wallLeft = x - wallW / 2;
    const wallRight = x + wallW / 2;

    const eaveOverhang = 18;
    const roofPeakH = 50;
    const roofLeft = wallLeft - eaveOverhang;
    const roofRight = wallRight + eaveOverhang;
    const roofBase = wallTop + 1;            // overlap by 1px so no seam
    const roofPeak = roofBase - roofPeakH;

    // Drop shadow.
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(x, wallBottom + 5, wallW + 30, 18);

    // Wall body, with subtle inner highlight on the upper third for depth.
    const wallShade = darken(palette.wall, 0.18);
    const wallHighlight = lighten(palette.wall, 0.12);
    g.fillStyle(palette.wall, 1);
    g.fillRect(wallLeft, wallTop, wallW, wallH);
    g.fillStyle(wallHighlight, 0.55);
    g.fillRect(wallLeft, wallTop, wallW, 8);
    g.fillStyle(wallShade, 0.5);
    g.fillRect(wallLeft, wallBottom - 6, wallW, 6);
    g.lineStyle(2, 0x000000, 0.55);
    g.strokeRect(wallLeft, wallTop, wallW, wallH);

    // Foundation stripe.
    g.fillStyle(0x000000, 0.3);
    g.fillRect(wallLeft, wallBottom - 2, wallW, 4);

    // Roof — drawn as a triangle, then a darker right slope for shading,
    // then horizontal shingle lines following the pitch.
    g.fillStyle(palette.roof, 1);
    g.beginPath();
    g.moveTo(roofLeft, roofBase);
    g.lineTo(x, roofPeak);
    g.lineTo(roofRight, roofBase);
    g.closePath();
    g.fillPath();

    // Right-slope shadow (right half of the roof, slightly darker).
    g.fillStyle(darken(palette.roof, 0.18), 0.6);
    g.beginPath();
    g.moveTo(x, roofPeak);
    g.lineTo(roofRight, roofBase);
    g.lineTo(x, roofBase);
    g.closePath();
    g.fillPath();

    // Roof outline.
    g.lineStyle(2, 0x000000, 0.7);
    g.beginPath();
    g.moveTo(roofLeft, roofBase);
    g.lineTo(x, roofPeak);
    g.lineTo(roofRight, roofBase);
    g.closePath();
    g.strokePath();

    // Shingle lines following the roof slope.
    g.lineStyle(1, 0x000000, 0.35);
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 5;
      const ny = roofPeak + t * roofPeakH;
      const halfW = (roofRight - roofLeft) / 2 * t;
      g.lineBetween(x - halfW, ny, x + halfW, ny);
    }

    // Chimney (drawn AFTER the roof so it sits on top, with a darker cap).
    g.fillStyle(0x4a3018, 1);
    g.fillRect(x + 22, roofPeak + 8, 10, 18);
    g.lineStyle(1, 0x000000, 0.7);
    g.strokeRect(x + 22, roofPeak + 8, 10, 18);
    g.fillStyle(0x2a1810, 1);
    g.fillRect(x + 19, roofPeak + 6, 16, 4);

    // Eave shadow under the roof, across the top of the wall.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(wallLeft, wallTop, wallW, 4);

    // Windows — two cross-paned squares, glowing yellow.
    drawWindow(g, x - 33, y + 14);
    drawWindow(g, x + 33, y + 14);

    // Door — arched top + body + step + knob.
    const doorW = 26;
    const doorBodyH = 30;
    const doorTop = y + 22;          // top of door body
    const doorLeft = x - doorW / 2;
    g.fillStyle(palette.door, 1);
    // arch (semicircle on top of the body)
    g.beginPath();
    g.arc(x, doorTop, doorW / 2, Math.PI, 0, false);
    g.closePath();
    g.fillPath();
    // body
    g.fillRect(doorLeft, doorTop, doorW, doorBodyH);
    // outline
    g.lineStyle(2, 0x000000, 0.7);
    g.beginPath();
    g.moveTo(doorLeft, doorTop + doorBodyH);
    g.lineTo(doorLeft, doorTop);
    g.arc(x, doorTop, doorW / 2, Math.PI, 0, false);
    g.lineTo(doorLeft + doorW, doorTop + doorBodyH);
    g.closePath();
    g.strokePath();
    // door step
    g.fillStyle(0x3a2210, 1);
    g.fillRect(x - 18, wallBottom - 1, 36, 4);
    // knob
    g.fillStyle(0xffd54f, 1);
    g.fillCircle(x + 8, doorTop + 16, 2);

    // Optional emoji sign on the wall above the door.
    const extras: Phaser.GameObjects.GameObject[] = [g];
    if (palette.sign) {
      extras.push(this.add.text(x, y + 6, palette.sign, { fontSize: "16px" }).setOrigin(0.5));
    }

    // Name plate above the roof.
    extras.push(
      this.add
        .text(x, roofPeak - 14, label, {
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: "13px",
          color: "#ffffff",
          stroke: "#000",
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );

    this.deco.add(extras);
  }

  private addPath(x: number, y: number, w: number, h: number) {
    const g = this.add.graphics();
    const left = x - w / 2;
    const top = y - h / 2;
    g.fillStyle(0xb8a878, 0.55);
    g.fillRect(left, top, w, h);
    g.lineStyle(1, 0x6e5a3a, 0.4);
    g.strokeRect(left, top, w, h);
    // cobble dots — gives the path a bit of texture without textures.
    g.fillStyle(0x8e7a52, 0.35);
    if (w >= h) {
      // horizontal path: dots along its length
      for (let cx = left + 14; cx < left + w - 8; cx += 22) {
        g.fillCircle(cx, y - 4, 1.6);
        g.fillCircle(cx + 11, y + 4, 1.6);
      }
    } else {
      for (let cy = top + 14; cy < top + h - 8; cy += 22) {
        g.fillCircle(x - 4, cy, 1.6);
        g.fillCircle(x + 4, cy + 11, 1.6);
      }
    }
    this.deco.add(g);
    return g;
  }

  private addFurniture(x: number, y: number, label: string, color: number) {
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

  private addExitDoor(x: number, y: number, label: string) {
    const frame = this.add.rectangle(x, y, 50, 70, 0x4a2a14).setStrokeStyle(3, 0x000, 0.7);
    const door = this.add.rectangle(x, y, 36, 56, 0x6e4a2b).setStrokeStyle(2, 0x2a1808, 0.8);
    const knob = this.add.circle(x + 10, y, 2.5, 0xffd54f);
    const txt = this.add
      .text(x, y - 60, label, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "13px",
        color: "#ffd54f",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.deco.add([frame, door, knob, txt]);
  }

  private addPortal(x: number, y: number, label: string) {
    const ring = this.add.circle(x, y, 40, 0x7d5cff, 0.4).setStrokeStyle(3, 0x7d5cff);
    const inner = this.add.circle(x, y, 22, 0xbda8ff, 0.3);
    const txt = this.add
      .text(x, y + 60, label, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "14px",
        color: "#bda8ff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.deco.add([ring, inner, txt]);
  }

  private spawnPlayerSprite(p: PlayerState, isMe: boolean) {
    const def = CLASSES[p.classId as ClassId];
    const c = def.color;
    const skin = 0xf2c79c;
    const dark = 0x2a2418;

    const leg1 = this.add.rectangle(-4, -2, 5, 14, dark).setOrigin(0.5, 0).setStrokeStyle(1, 0x000, 0.6);
    const leg2 = this.add.rectangle(4, -2, 5, 14, dark).setOrigin(0.5, 0).setStrokeStyle(1, 0x000, 0.6);
    const arm1 = this.add.rectangle(-9, -14, 4, 13, c).setOrigin(0.5, 0).setStrokeStyle(1, 0x000, 0.6);
    const arm2 = this.add.rectangle(9, -14, 4, 13, c).setOrigin(0.5, 0).setStrokeStyle(1, 0x000, 0.6);
    const torso = this.add.rectangle(0, -16, 16, 14, c).setOrigin(0.5, 0).setStrokeStyle(1, 0x000, 0.6);
    const head = this.add.circle(0, -23, 7, skin).setStrokeStyle(1, 0x000, 0.8);

    const badge = this.add
      .text(11, -28, def.emoji, {
        fontSize: "13px",
      })
      .setOrigin(0.5);

    const nameTag = this.add
      .text(0, -38, `${p.name} · L${p.level}`, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "12px",
        color: isMe ? "#ffd54f" : "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const hpBarBg = this.add.rectangle(0, -49, 36, 5, 0x000, 0.7).setStrokeStyle(1, 0x2a2a3a);
    const hpBarFill = this.add.rectangle(-18, -49, 36, 4, 0x5dc88a).setOrigin(0, 0.5);

    let selfRing: Phaser.GameObjects.Ellipse | null = null;
    const children: Phaser.GameObjects.GameObject[] = [
      leg1, leg2, arm1, arm2, torso, head, badge, nameTag, hpBarBg, hpBarFill,
    ];
    if (isMe) {
      selfRing = this.add.ellipse(0, 14, 28, 8, 0xffd54f, 0.25).setStrokeStyle(1, 0xffd54f, 0.6);
      children.unshift(selfRing);
    }

    const container = this.add.container(p.pos.x, p.pos.y, children);
    container.setDepth(10);

    if (isMe) {
      this.cameras.main.startFollow(container, false, FOLLOW_LERP, FOLLOW_LERP);
    }

    this.players.set(p.id, {
      container,
      head,
      torso,
      leg1,
      leg2,
      arm1,
      arm2,
      badge,
      nameTag,
      hpBarBg,
      hpBarFill,
      selfRing,
      targetPos: { x: p.pos.x, y: p.pos.y },
      state: p,
      walkPhase: 0,
      lastFacing: 0,
    });
  }

  private spawnFloorItem(item: FloorItem): Phaser.GameObjects.Container {
    const def = ITEMS[item.itemId];
    const emoji = def?.emoji ?? "❓";
    const rarityColor: Record<string, number> = {
      common: 0xcbd5e1,
      uncommon: 0x5dc88a,
      rare: 0x5b8aff,
      epic: 0xbd5fff,
      legendary: 0xffd54f,
    };
    const color = rarityColor[def?.rarity ?? "common"] ?? 0xcbd5e1;
    const shadow = this.add.ellipse(0, 8, 30, 8, 0x000000, 0.4);
    const halo = this.add.circle(0, 0, 16, color, 0.18).setStrokeStyle(2, color, 0.7);
    const icon = this.add.text(0, 0, emoji, { fontSize: "20px" }).setOrigin(0.5);
    const c = this.add.container(item.x, item.y, [shadow, halo, icon]);
    c.setDepth(8);
    // Gentle pulse
    this.tweens.add({
      targets: halo,
      scale: { from: 0.9, to: 1.15 },
      alpha: { from: 0.4, to: 0.18 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private spawnMonsterSprite(m: MonsterState) {
    const def = MONSTERS[m.type];

    // Per-type color palette + body parts.
    const shadow = this.add.ellipse(0, 18, 38, 10, 0x000, 0.35);
    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    let bodyShape: Phaser.GameObjects.Shape;

    switch (m.type) {
      case "slime": {
        // Half-blob with two dot eyes.
        const blob = this.add.ellipse(0, 4, 40, 32, 0x5dc88a).setStrokeStyle(2, 0x000, 0.6);
        const highlight = this.add.ellipse(-8, -4, 12, 6, 0xffffff, 0.45);
        const eyeL = this.add.circle(-7, 4, 3, 0x000);
        const eyeR = this.add.circle(7, 4, 3, 0x000);
        const mouth = this.add.rectangle(0, 13, 10, 2, 0x000);
        bodyShape = blob;
        parts.push(blob, highlight, eyeL, eyeR, mouth);
        break;
      }
      case "goblin": {
        const torso = this.add.rectangle(0, 6, 22, 22, 0x6f8a3a).setStrokeStyle(2, 0x000, 0.7);
        const head = this.add.circle(0, -10, 10, 0x86a04a).setStrokeStyle(2, 0x000, 0.7);
        const earL = this.add.triangle(-9, -12, 0, 0, 6, -8, 0, 8, 0x86a04a).setStrokeStyle(2, 0x000, 0.5);
        const earR = this.add.triangle(9, -12, 0, 0, -6, -8, 0, 8, 0x86a04a).setStrokeStyle(2, 0x000, 0.5);
        const eyeL = this.add.circle(-3, -10, 1.6, 0xffd54f);
        const eyeR = this.add.circle(3, -10, 1.6, 0xffd54f);
        const club = this.add.rectangle(15, 8, 4, 18, 0x6e4a2b).setStrokeStyle(1, 0x000, 0.7);
        bodyShape = torso;
        parts.push(earL, earR, torso, head, eyeL, eyeR, club);
        break;
      }
      case "wolf": {
        const torso = this.add.ellipse(-4, 6, 44, 22, 0x666666).setStrokeStyle(2, 0x000, 0.7);
        const head = this.add.ellipse(15, -2, 22, 16, 0x6e6e6e).setStrokeStyle(2, 0x000, 0.7);
        const earL = this.add.triangle(11, -10, 0, 6, 4, -4, -3, 0, 0x4a4a4a);
        const earR = this.add.triangle(19, -10, 0, 6, 4, -4, -3, 0, 0x4a4a4a);
        const eye = this.add.circle(20, -2, 1.6, 0xffd54f);
        const tail = this.add.triangle(-22, 4, 0, 0, -10, -4, -10, 6, 0x4a4a4a);
        const fang = this.add.rectangle(22, 4, 2, 4, 0xffffff);
        bodyShape = torso;
        parts.push(tail, torso, head, earL, earR, eye, fang);
        break;
      }
      case "skeleton": {
        const torso = this.add.rectangle(0, 8, 18, 22, 0xe2e2ea).setStrokeStyle(2, 0x000, 0.8);
        const ribL = this.add.rectangle(-5, 4, 8, 1.5, 0x6a6a76);
        const ribR = this.add.rectangle(5, 4, 8, 1.5, 0x6a6a76);
        const ribL2 = this.add.rectangle(-5, 10, 8, 1.5, 0x6a6a76);
        const ribR2 = this.add.rectangle(5, 10, 8, 1.5, 0x6a6a76);
        const skull = this.add.circle(0, -9, 11, 0xf2f2f8).setStrokeStyle(2, 0x000, 0.8);
        const eyeL = this.add.circle(-3, -10, 2.2, 0x000);
        const eyeR = this.add.circle(3, -10, 2.2, 0x000);
        const jaw = this.add.rectangle(0, -2, 10, 2, 0x000);
        bodyShape = torso;
        parts.push(torso, ribL, ribR, ribL2, ribR2, skull, eyeL, eyeR, jaw);
        break;
      }
      case "wraith": {
        // Ghostly oval, faded at the bottom — rendered as two stacked ellipses.
        const aura = this.add.ellipse(0, 0, 44, 44, 0x442266, 0.35);
        const robe = this.add.ellipse(0, 4, 36, 38, 0x5e3a8a, 0.7).setStrokeStyle(2, 0xff5588, 0.8);
        const eyeL = this.add.circle(-5, -2, 2.2, 0xff3344);
        const eyeR = this.add.circle(5, -2, 2.2, 0xff3344);
        const eyeGlowL = this.add.circle(-5, -2, 4.5, 0xff3344, 0.3);
        const eyeGlowR = this.add.circle(5, -2, 4.5, 0xff3344, 0.3);
        bodyShape = robe;
        parts.push(aura, robe, eyeGlowL, eyeGlowR, eyeL, eyeR);
        break;
      }
      default: {
        const fallback = this.add.circle(0, 0, 18, 0x444444).setStrokeStyle(2, 0xe05d5d);
        bodyShape = fallback;
        parts.push(fallback);
      }
    }

    const hpBarBg = this.add.rectangle(0, -32, 40, 5, 0x000, 0.7).setStrokeStyle(1, 0x2a2a3a);
    const hpBarFill = this.add.rectangle(-20, -32, 40, 4, 0xe05d5d).setOrigin(0, 0.5);
    const lvTag = this.add
      .text(0, -46, `Lv ${m.level} ${def.name}`, {
        fontFamily: "Cinzel, Georgia, serif",
        fontSize: "11px",
        color: "#ffd1d1",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    parts.push(hpBarBg, hpBarFill, lvTag);

    const container = this.add.container(m.pos.x, m.pos.y, parts);
    container.setDepth(9);
    container.setSize(56, 56);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.engageTarget(m.id);
    });

    void bodyShape;
    this.monsters.set(m.id, {
      container,
      hpBarBg,
      hpBarFill,
      selectionRing: null,
      state: m,
      targetPos: { x: m.pos.x, y: m.pos.y },
    });
  }

  private engageTarget(monsterId: string) {
    useGameStore.getState().selectTarget(monsterId);
    this.autoAttackTargetId = monsterId;
    const sprite = this.monsters.get(monsterId);
    if (sprite) {
      this.moveTarget = { x: sprite.container.x, y: sprite.container.y };
    }
  }

  private handlePointer(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);

    let nearestMonster: MonsterSprite | null = null;
    let bestDist = 48;
    for (const sprite of this.monsters.values()) {
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, sprite.container.x, sprite.container.y);
      if (d < bestDist) {
        bestDist = d;
        nearestMonster = sprite;
      }
    }
    if (nearestMonster) {
      this.engageTarget(nearestMonster.state.id);
      return;
    }

    this.autoAttackTargetId = null;
    useGameStore.getState().selectTarget(null);
    this.moveTarget = { x: wp.x, y: wp.y };
    this.targetIndicator.setPosition(wp.x, wp.y).setVisible(true).setAlpha(0.8);
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

    if (this.autoAttackTargetId) {
      const monster = this.monsters.get(this.autoAttackTargetId);
      if (!monster) {
        this.autoAttackTargetId = null;
      } else {
        const dx = monster.container.x - mySprite.container.x;
        const dy = monster.container.y - mySprite.container.y;
        const dist = Math.hypot(dx, dy);
        const def = CLASSES[me.classId as ClassId];
        const attackRange = def.attackRange;
        if (dist <= attackRange - 6) {
          this.moveTarget = null;
          const now = performance.now();
          if (now - this.lastSentAttack > def.attackInterval) {
            this.lastSentAttack = now;
            emitAttack(this.autoAttackTargetId);
          }
        } else {
          this.moveTarget = { x: monster.container.x, y: monster.container.y };
        }
      }
    }

    let isMoving = false;
    if (this.moveTarget) {
      const dx = this.moveTarget.x - mySprite.container.x;
      const dy = this.moveTarget.y - mySprite.container.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        isMoving = true;
        const speed = me.stats.speed;
        const step = Math.min(dist, (speed * delta) / 1000);
        const nx = mySprite.container.x + (dx / dist) * step;
        const ny = mySprite.container.y + (dy / dist) * step;
        mySprite.container.setPosition(nx, ny);
        const facing = Math.atan2(dy, dx);
        mySprite.lastFacing = facing;
        this.faceDirection(mySprite, dx);

        const now = performance.now();
        if (now - this.lastSentMove > MOVE_SEND_INTERVAL) {
          this.lastSentMove = now;
          emitMove({ x: nx, y: ny }, facing);
        }
      } else {
        emitMove({ x: this.moveTarget.x, y: this.moveTarget.y }, mySprite.lastFacing);
        this.moveTarget = null;
      }
    }

    this.animateWalk(mySprite, isMoving, delta);

    for (const [id, sprite] of this.players) {
      if (id === me.id) continue;
      const dx = sprite.targetPos.x - sprite.container.x;
      const dy = sprite.targetPos.y - sprite.container.y;
      const moving = Math.hypot(dx, dy) > 1.5;
      if (moving) this.faceDirection(sprite, dx);
      sprite.container.x += dx * NETWORK_LERP;
      sprite.container.y += dy * NETWORK_LERP;
      this.animateWalk(sprite, moving, delta);
    }
    for (const sprite of this.monsters.values()) {
      const dx = sprite.targetPos.x - sprite.container.x;
      const dy = sprite.targetPos.y - sprite.container.y;
      sprite.container.x += dx * NETWORK_LERP;
      sprite.container.y += dy * NETWORK_LERP;
    }

    this.checkAutoRetaliate();
    this.checkEnterables(mySprite);

    useGameStore.getState().clearOldFloatings();
  }

  private faceDirection(sprite: PlayerSprite, dx: number) {
    if (Math.abs(dx) < 0.5) return;
    const want = dx < 0 ? -1 : 1;
    if (Math.sign(sprite.container.scaleX) !== want) {
      sprite.container.scaleX = want;
    }
  }

  private animateWalk(sprite: PlayerSprite, isMoving: boolean, delta: number) {
    if (isMoving) {
      sprite.walkPhase += (delta / 1000) * WALK_BOB_HZ * Math.PI * 2;
      const swing = Math.sin(sprite.walkPhase) * 22;
      sprite.leg1.angle = swing;
      sprite.leg2.angle = -swing;
      sprite.arm1.angle = -swing * 0.7;
      sprite.arm2.angle = swing * 0.7;
      const bob = Math.abs(Math.sin(sprite.walkPhase)) * 1.5;
      sprite.head.y = -23 - bob;
      sprite.torso.y = -16 - bob * 0.5;
    } else {
      sprite.walkPhase = 0;
      sprite.leg1.angle = 0;
      sprite.leg2.angle = 0;
      sprite.arm1.angle = 0;
      sprite.arm2.angle = 0;
      sprite.head.y = -23;
      sprite.torso.y = -16;
    }
  }

  private checkEnterables(mySprite: PlayerSprite) {
    let nearest: Enterable | null = null;
    let bestDist = Infinity;
    for (const e of this.enterables) {
      const d = Phaser.Math.Distance.Between(
        mySprite.container.x,
        mySprite.container.y,
        e.x,
        e.y,
      );
      if (d < e.radius && d < bestDist) {
        bestDist = d;
        nearest = e;
      }
    }

    if (!nearest) {
      // Walked away from all triggers → re-arm.
      this.enterPrompt.setVisible(false);
      this.armedForEnter = true;
      return;
    }

    this.enterPrompt
      .setText(`▼ ${nearest.label} ▼`)
      .setPosition(mySprite.container.x, mySprite.container.y - 60)
      .setVisible(true);

    if (!this.armedForEnter) return;

    // Fire exactly once per (walk-out, walk-in) cycle.
    this.armedForEnter = false;
    this.moveTarget = null;
    if (nearest.target.kind === "zone") {
      this.autoAttackTargetId = null;
      emitTravel(nearest.target.zone);
    } else {
      useGameStore.getState().setActivePanel(nearest.target.panel);
    }
  }

  private checkAutoRetaliate() {
    const incoming = useGameStore.getState().incomingAttackerId;
    if (!incoming) return;
    useGameStore.getState().clearIncomingAttacker();
    if (this.autoAttackTargetId) return;
    if (!this.monsters.has(incoming)) return;
    this.engageTarget(incoming);
  }

  shutdown() {
    this.unsubscribe?.();
  }
}

// ---------- color + drawing helpers ----------

function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
  return (r << 16) | (g << 8) | b;
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
  return (r << 16) | (g << 8) | b;
}

function drawWindow(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const w = 14;
  const h = 14;
  const left = cx - w / 2;
  const top = cy - h / 2;
  // glow
  g.fillStyle(0xffe8a0, 1);
  g.fillRect(left, top, w, h);
  // upper highlight to suggest light from inside
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(left + 1, top + 1, w - 2, h / 2 - 1);
  // cross panes
  g.lineStyle(1.5, 0x3a2210, 1);
  g.lineBetween(cx, top, cx, top + h);
  g.lineBetween(left, cy, left + w, cy);
  // frame
  g.lineStyle(2, 0x3a2210, 1);
  g.strokeRect(left, top, w, h);
}
