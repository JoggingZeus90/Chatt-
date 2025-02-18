import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { hexToHsva, hsvaToHex } from '@uiw/color-convert';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Paintbrush } from "lucide-react"

interface ColorPickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  className?: string
  value?: string
  onChange?: (value: string) => void
}

const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ label, className, value = '#000000', onChange, ...props }, ref) => {
    const [open, setOpen] = React.useState(false)
    const [hsva, setHsva] = React.useState(() => hexToHsva(value));
    const wheelRef = React.useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    React.useEffect(() => {
      setHsva(hexToHsva(value));
    }, [value]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleColorSelect(e);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDragging) {
        handleColorSelect(e);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleColorSelect = (e: React.MouseEvent<HTMLDivElement>) => {
      const wheel = wheelRef.current;
      if (!wheel) return;

      const rect = wheel.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };
      const x = e.clientX - rect.left - center.x;
      const y = e.clientY - rect.top - center.y;
      const radius = rect.width / 2;

      // Calculate angle and distance from center
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      // Rotate 90 degrees counterclockwise to align with standard HSL color wheel
      angle = (angle + 450) % 360;

      const distance = Math.min(Math.sqrt(x * x + y * y), radius);
      const saturation = (distance / radius) * 100;

      const newColor = {
        h: angle,
        s: saturation,
        v: 100,
        a: 1
      };

      setHsva(newColor);
      onChange?.(hsvaToHex(newColor));
    };

    React.useEffect(() => {
      if (isDragging) {
        const handleGlobalMouseUp = () => setIsDragging(false);
        const handleGlobalMouseMove = (e: MouseEvent) => {
          if (isDragging) {
            handleColorSelect(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('mousemove', handleGlobalMouseMove);
        return () => {
          window.removeEventListener('mouseup', handleGlobalMouseUp);
          window.removeEventListener('mousemove', handleGlobalMouseMove);
        };
      }
    }, [isDragging]);

    return (
      <div className="flex flex-col gap-2" ref={ref}>
        {label && <Label>{label}</Label>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-[280px] justify-start text-left font-normal"
            >
              <div
                className="mr-2 h-4 w-4 rounded-full"
                style={{ backgroundColor: value }}
              />
              <Paintbrush className="mr-2 h-4 w-4" />
              {value}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-4" side="right" sideOffset={5}>
            <div className="flex flex-col gap-4">
              <div 
                ref={wheelRef}
                className="relative w-[240px] h-[240px] rounded-full cursor-crosshair"
                style={{
                  background: `conic-gradient(
                    hsl(0, 100%, 50%),
                    hsl(60, 100%, 50%),
                    hsl(120, 100%, 50%),
                    hsl(180, 100%, 50%),
                    hsl(240, 100%, 50%),
                    hsl(300, 100%, 50%),
                    hsl(360, 100%, 50%)
                  )`
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <div 
                  className="absolute w-full h-full rounded-full"
                  style={{
                    background: `radial-gradient(circle at center,
                      white 0%,
                      transparent 70%
                    )`
                  }}
                />
                <div
                  className="absolute w-4 h-4 transform -translate-x-1/2 -translate-y-1/2 border-2 border-white rounded-full shadow-md pointer-events-none"
                  style={{
                    left: `${(hsva.s / 100) * 120 * Math.cos((hsva.h + 90) * Math.PI / 180) + 120}px`,
                    top: `${(hsva.s / 100) * 120 * Math.sin((hsva.h + 90) * Math.PI / 180) + 120}px`,
                    backgroundColor: hsvaToHex(hsva),
                  }}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }
)

ColorPicker.displayName = "ColorPicker"

export { ColorPicker }