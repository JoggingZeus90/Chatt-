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

      // Calculate relative position from center
      const x = e.clientX - rect.left - centerX;
      const y = e.clientY - rect.top - centerY;

      // Calculate angle and distance from center
      let hue = Math.atan2(-x, y) * (180 / Math.PI) + 180;

      // Calculate distance for saturation (0-100%)
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

    // Calculate position for the selector dot
    const selectorStyle = React.useMemo(() => {
      const radius = (hsva.s / 100) * 120;
      const angleRad = ((hsva.h - 180) * Math.PI) / 180;
      return {
        left: `${-radius * Math.sin(angleRad) + 120}px`,
        top: `${radius * Math.cos(angleRad) + 120}px`,
        backgroundColor: hsvaToHex(hsva),
      };
    }, [hsva]);

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
                    from 0deg,
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