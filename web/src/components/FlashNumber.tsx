import { fmtPrice } from "../format";
import { useFlash } from "../useFlash";

export function FlashNumber({
  value,
  unit,
  className
}: {
  value: number | null;
  unit: "TOMAN" | "USD";
  className?: string;
}) {
  const flash = useFlash(value);
  const classes = [className, flash ? `flash flash--${flash}` : ""].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <bdi>{fmtPrice(value, unit)}</bdi>
    </span>
  );
}
