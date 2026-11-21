import type { PriceItem } from "@mesghalyar/shared";
import { BRAND } from "./brand";
import { faNum, faNum2, fmtDate, fmtPct, fmtTime } from "./format";

export type ImageCategory = "gold" | "currency" | "all";

export const IMAGE_CATEGORY_LABEL: Record<ImageCategory, string> = {
  gold: "طلا و سکه",
  currency: "ارز",
  all: "همهٔ قیمت‌ها"
};

const WIDTH = 1080;
const PAD = 64;
const ROW_H = 92;
const HEADER_H = 250;
const FOOTER_H = 150;

function pickItems(items: PriceItem[], category: ImageCategory): PriceItem[] {
  const rows = items.filter((item) => item.price !== null);
  if (category === "gold") return rows.filter((item) => item.category === "gold" || item.category === "coin");
  if (category === "currency") return rows.filter((item) => item.category === "currency");
  return rows;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBrand(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const outer = new Path2D(BRAND.iconOuter);
  const inner = new Path2D(BRAND.iconInner);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, 40, 40);
  grad.addColorStop(0, "#f6dfa0");
  grad.addColorStop(0.5, "#e9c46a");
  grad.addColorStop(1, "#a97d1e");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.6;
  ctx.stroke(outer);
  ctx.fillStyle = grad;
  ctx.fill(inner);
  ctx.restore();
}

export async function buildPriceImage(
  items: PriceItem[],
  category: ImageCategory,
  now = new Date()
): Promise<Blob> {
  // Waiting for every font face stalls the export; the Vazirmatn family is the
  // only one used here, so ask for that face alone and cap the wait.
  if (!document.fonts.check('600 30px "Vazirmatn Variable"')) {
    await Promise.race([
      document.fonts.load('600 30px "Vazirmatn Variable"').catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 400))
    ]);
  }
  const rows = pickItems(items, category);
  const height = HEADER_H + Math.max(rows.length, 1) * ROW_H + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.direction = "rtl";

  const bg = ctx.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, "#070c18");
  bg.addColorStop(0.55, "#0a1020");
  bg.addColorStop(1, "#0d1426");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);

  const glow = ctx.createRadialGradient(WIDTH * 0.78, 40, 0, WIDTH * 0.78, 40, 720);
  glow.addColorStop(0, "rgba(233,196,106,0.20)");
  glow.addColorStop(1, "rgba(233,196,106,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEADER_H + 140);

  ctx.strokeStyle = "rgba(233,196,106,0.45)";
  ctx.lineWidth = 2;
  roundRect(ctx, 20, 20, WIDTH - 40, height - 40, 30);
  ctx.stroke();

  drawBrand(ctx, WIDTH - PAD - 120, 50, 3);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f6f1e4";
  ctx.font = '700 58px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(BRAND.name, WIDTH - PAD - 148, 112);
  ctx.fillStyle = "#e9c46a";
  ctx.font = '500 26px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(BRAND.tagline, WIDTH - PAD - 148, 156);

  ctx.textAlign = "left";
  ctx.fillStyle = "#9aa3b8";
  ctx.font = '500 25px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(fmtTime(now.getTime()), PAD, 94);
  ctx.fillText(fmtDate(now), PAD, 134);

  ctx.textAlign = "right";
  ctx.fillStyle = "#cfd6e6";
  ctx.font = '600 32px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(IMAGE_CATEGORY_LABEL[category], WIDTH - PAD, 218);
  ctx.fillStyle = "#7f889e";
  ctx.font = '500 22px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText("قیمت‌های لحظه‌ای تابلو · به تومان", WIDTH - PAD - 250, 218);

  ctx.strokeStyle = "rgba(233,196,106,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, HEADER_H - 16);
  ctx.lineTo(WIDTH - PAD, HEADER_H - 16);
  ctx.stroke();

  if (rows.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#9aa3b8";
    ctx.font = '500 32px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
    ctx.fillText("قیمتی برای نمایش در دسترس نیست", WIDTH / 2, HEADER_H + ROW_H / 2 + 10);
  }

  rows.forEach((item, index) => {
    const y = HEADER_H + index * ROW_H;
    if (index % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.028)";
      roundRect(ctx, PAD - 16, y + 10, WIDTH - (PAD - 16) * 2, ROW_H - 20, 16);
      ctx.fill();
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#e7ebf4";
    ctx.font = '600 30px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(item.title, WIDTH - PAD, y + 46);

    const pct = item.changePct;
    ctx.fillStyle = pct === null ? "#7f889e" : pct > 0 ? "#43d493" : pct < 0 ? "#f16f6f" : "#7f889e";
    ctx.font = '500 23px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(fmtPct(pct), WIDTH - PAD, y + 74);

    ctx.textAlign = "left";
    ctx.fillStyle = "#f6dfa0";
    ctx.font = '700 34px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
    const value = item.unit === "TOMAN" ? faNum(item.price as number) : faNum2(item.price as number);
    ctx.fillText(value, PAD + 30, y + 50);
    ctx.fillStyle = "#8f97ac";
    ctx.font = '500 20px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
    ctx.fillText(item.unit === "TOMAN" ? "تومان" : "دلار", PAD + 30, y + 78);
  });

  const footerY = height - FOOTER_H;
  ctx.strokeStyle = "rgba(233,196,106,0.28)";
  ctx.beginPath();
  ctx.moveTo(PAD, footerY);
  ctx.lineTo(WIDTH - PAD, footerY);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#c9d0e0";
  ctx.font = '500 23px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(BRAND.disclaimer, WIDTH / 2, footerY + 52);
  ctx.fillStyle = "#e9c46a";
  ctx.font = '600 22px "Vazirmatn Variable", Vazirmatn, Tahoma, sans-serif';
  ctx.fillText(`${BRAND.name} · ${BRAND.latin}`, WIDTH / 2, footerY + 96);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG_FAILED"));
    }, "image/png");
  });
}

export function imageFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `narkhino-prices-${stamp}.png`;
}
