import * as React from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ColorPickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  className?: string
}

const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ label, className, ...props }, ref) => {
    const [color, setColor] = React.useState(props.defaultValue as string)

    return (
      <div className="flex flex-col gap-2">
        {label && <Label>{label}</Label>}
        <div className="flex gap-2 items-center">
          <div
            className="w-10 h-10 rounded-md border"
            style={{ backgroundColor: color }}
          />
          <Input
            ref={ref}
            type="color"
            className={cn(
              "h-10 p-1 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none",
              className
            )}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            {...props}
          />
        </div>
      </div>
    )
  }
)
ColorPicker.displayName = "ColorPicker"

export { ColorPicker }
