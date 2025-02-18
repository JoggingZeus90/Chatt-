import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import Wheel from '@uiw/react-color-wheel';
import { hexToHsva, hsvaToHex } from '@uiw/color-convert';

interface ColorPickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  className?: string
  value?: string
  onChange?: (value: string) => void
}

const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ label, className, value = '#000000', onChange, ...props }, ref) => {
    const hsva = React.useMemo(() => hexToHsva(value), [value]);

    return (
      <div className="flex flex-col gap-4" ref={ref}>
        {label && <Label>{label}</Label>}
        <div className="flex gap-4 items-center">
          <div
            className="w-10 h-10 rounded-md border"
            style={{ backgroundColor: value }}
          />
          <div className="relative w-[200px] h-[200px]">
            <Wheel 
              color={hsva}
              onChange={(color) => {
                const hex = hsvaToHex(color);
                onChange?.(hex);
              }}
            />
          </div>
        </div>
      </div>
    )
  }
)

ColorPicker.displayName = "ColorPicker"

export { ColorPicker }
