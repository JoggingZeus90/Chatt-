import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { hexToHsva, hsvaToHex } from '@uiw/color-convert';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Paintbrush } from "lucide-react"
import { Slider } from "@/components/ui/slider"

interface ColorPickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  className?: string
  value?: string
  contrast?: number
  onChange?: (value: string) => void
  onContrastChange?: (value: number) => void
}

const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ label, className, value = '#000000', contrast = 100, onChange, onContrastChange, ...props }, ref) => {
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
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const x = e.clientX - rect.left - centerX;
      const y = e.clientY - rect.top - centerY;

      let hue = Math.atan2(-x, y) * (180 / Math.PI) + 180;

      const radius = rect.width / 2;
      const distance = Math.sqrt(x * x + y * y);
      const saturation = Math.min(distance / radius * 100, 100);

      setHsva({
        h: hue,
        s: saturation,
        v: 100,
        a: 1
      });

      onChange?.(hsvaToHex({ h: hue, s: saturation, v: 100, a: 1 }));
    };

    React.useEffect(() => {
      if (isDragging) {
        const handleGlobalMouseUp = () => setIsDragging(false);
        const handleGlobalMouseMove = (e: MouseEvent) => {
          if (isDragging && wheelRef.current) {
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

    function getAdjustedLightness(baseL: number) {
      return Math.min(Math.max((baseL * contrast) / 100, 0), 100);
    }

    // Calculate position for the selector dot and apply contrast
    const selectorStyle = React.useMemo(() => {
      const radius = (hsva.s / 100) * 120;
      const angleRad = ((hsva.h - 180) * Math.PI) / 180;
      const hex = hsvaToHex(hsva);
      const hsl = hexToHSL(hex);
      const adjustedL = getAdjustedLightness(hsl.l);

      return {
        left: `${-radius * Math.sin(angleRad) + 120}px`,
        top: `${radius * Math.cos(angleRad) + 120}px`,
        backgroundColor: `hsl(${hsl.h}, ${hsl.s}%, ${adjustedL}%)`,
      };
    }, [hsva, contrast]);

    // Generate color wheel gradient with contrast adjustment
    const wheelGradient = React.useMemo(() => {
      const baseL = 50; // Base lightness for the color wheel
      const adjustedL = getAdjustedLightness(baseL);

      return `conic-gradient(
        from 0deg,
        hsl(0, 100%, ${adjustedL}%),
        hsl(60, 100%, ${adjustedL}%),
        hsl(120, 100%, ${adjustedL}%),
        hsl(180, 100%, ${adjustedL}%),
        hsl(240, 100%, ${adjustedL}%),
        hsl(300, 100%, ${adjustedL}%),
        hsl(360, 100%, ${adjustedL}%)
      )`;
    }, [contrast]);

    // Helper function to convert hex to HSL (same as in useTheme)
    function hexToHSL(hex: string) {
      hex = hex.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      let l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h = h / 6;
      }

      return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
      };
    }

    // Get adjusted color for preview
    const previewColor = React.useMemo(() => {
      const hsl = hexToHSL(value);
      const adjustedL = getAdjustedLightness(hsl.l);
      return `hsl(${hsl.h}, ${hsl.s}%, ${adjustedL}%)`;
    }, [value, contrast]);

    return (
      <div className={cn("flex flex-col gap-2", className)} ref={ref}>
        {label && <Label>{label}</Label>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-[280px] justify-start text-left font-normal"
            >
              <div
                className="mr-2 h-4 w-4 rounded-full"
                style={{ backgroundColor: previewColor }}
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
                  background: wheelGradient
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
                  style={selectorStyle}
                />
              </div>
              <div className="space-y-2">
                <Label>Contrast</Label>
                <Slider
                  value={[contrast]}
                  min={50}
                  max={150}
                  step={1}
                  onValueChange={([value]) => onContrastChange?.(value)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50%</span>
                  <span>{contrast}%</span>
                  <span>150%</span>
                </div>
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