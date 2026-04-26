import Phaser from "phaser";
import { WorldScene } from "./scenes/WorldScene";

let game: Phaser.Game | null = null;

export function startPhaser(parent: HTMLElement): void {
  if (game) return;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#0a0a0f",
    physics: { default: "arcade", arcade: { debug: false } },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: { target: 60, smoothStep: true },
    scene: [WorldScene],
    pixelArt: false,
    antialias: true,
  });
}

export function stopPhaser(): void {
  if (game) {
    game.destroy(true);
    game = null;
  }
}
