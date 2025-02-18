import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import Wheel from '@uiw/react-color-wheel';
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
    const hsva = React.useMemo(() => hexToHsva(value), [value]);

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
          <PopoverContent className="w-[280px] p-4">
            <div className="flex flex-col gap-4">
              <div className="relative aspect-square">
                <Wheel 
                  width={240}
                  height={240}
                  color={hsva}
                  onChange={(color) => {
                    onChange?.(hsvaToHex(color))
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