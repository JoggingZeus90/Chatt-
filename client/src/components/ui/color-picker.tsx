import * as React from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ColorPickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  className?: string
}

const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ label, className, value, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && <Label>{label}</Label>}
        <div className="flex gap-2 items-center">
          <div
            className="w-10 h-10 rounded-md border"
            style={{ backgroundColor: value as string }}
          />
          <Input
            ref={ref}
            type="color"
            className={cn(
              "h-10 p-1 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:!transition-[width,height] [&::-webkit-color-swatch]:!duration-75 [&::-webkit-color-swatch]:!ease-in-out [&::-moz-color-swatch]:!transition-[width,height] [&::-moz-color-swatch]:!duration-75 [&::-moz-color-swatch]:!ease-in-out",
              className
            )}
            value={value}
            {...props}
          />
        </div>
      </div>
    )
  }
)
ColorPicker.displayName = "ColorPicker"

export { ColorPicker }